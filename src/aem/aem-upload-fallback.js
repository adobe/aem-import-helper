/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { DirectBinaryUpload, DirectBinaryUploadOptions } from '@adobe/aem-upload';

export function toPosix(p) {
  return p.replaceAll('\\', '/');
}

export function encodePathSegments(posixPath) {
  return posixPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function formatErrors(errors) {
  if (!Array.isArray(errors)) {
    return errors ? String(errors) : '';
  }
  return errors.map((e) => e?.message || String(e)).join(', ');
}

/**
 * Count the successful files of an @adobe/aem-upload upload by listening to its 'fileend' events.
 * The upload result's totalCompleted can't be used: in @adobe/aem-upload 2.0.3 it misses files whose
 * name contains characters like `,` `+` `=` or `&` (decodeURI vs decodeURIComponent lookup keys).
 * @param {EventEmitter} emitter - The FileSystemUpload or DirectBinaryUpload instance.
 * @return {{count: () => number, stop: () => void}}
 */
export function trackCompletedFiles(emitter) {
  let completed = 0;
  const onFileEnd = () => {
    completed += 1;
  };
  emitter.on('fileend', onFileEnd);
  return {
    count: () => completed,
    stop: () => emitter.removeListener('fileend', onFileEnd),
  };
}

function folderApiUrl(urlPrefix, relativeFolderPosix) {
  // The Assets HTTP API lives at <origin>/api/assets, not under /content/dam.
  const { origin } = new URL(urlPrefix);
  const rel = encodePathSegments(relativeFolderPosix);
  return `${origin}/api/assets/${rel}`;
}

/**
 * Create an AEM Assets folder and all its parents under /content/dam using the Assets HTTP API.
 * Treats HTTP 409 as "already exists".
 */
export async function ensureAemFolderExists({
  urlPrefix,              // e.g. https://host/content/dam (only the origin is used)
  relativeFolderPosix,    // e.g. "a/b/c" (no leading slash)
  headers,                // { Authorization: `Bearer ...` }
}) {
  const parts = relativeFolderPosix.split('/').filter(Boolean);

  let curr = '';
  for (const part of parts) {
    curr = curr ? `${curr}/${part}` : part;
    const createUrl = folderApiUrl(urlPrefix, curr);

    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        class: 'assetFolder',
        properties: {
          'jcr:title': part,
        },
      }),
    });

    if (res.ok) continue;
    if (res.status === 409) continue;

    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to create AEM folder "${curr}" (${res.status} ${res.statusText}): ${text}`,
    );
  }
}

/**
 * Upload files directly inside localDir (non-recursive) into the matching AEM folder.
 * This is used only when FileSystemUpload can't proceed due to TOO_LARGE and there are no
 * subdirectories to split further.
 * @returns {Promise<Array<{batchNumber: number, filesInBatch: number, filesUploaded: number,
 *   filesFailed: number, errors: string[], result?: object}>>} One entry per batch. A batch failed
 *   if filesFailed > 0 or errors is not empty.
 */
export async function uploadFlatDirInBatches({
  localDir,
  rootDir,           // original assetFolder root (e.g. <output>/xwalk), uploaded as /content/dam/xwalk
  urlPrefix,         // https://host/content/dam
  headers,
  replace = true,
  maxConcurrent = 5,
  maxFilesPerBatch = 200,
}) {
  const entries = await fs.readdir(localDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.join(localDir, e.name));

  if (!files.length) return [];

  // Like FileSystemUpload, the root folder itself is uploaded under urlPrefix, so keep its name in the path.
  const relDir = path.relative(path.dirname(rootDir), localDir);
  const relDirPosix = toPosix(relDir);

  // Ensure the directory exists in AEM (and parents).
  if (relDirPosix && relDirPosix !== '.') {
    console.log(chalk.cyan(`Ensuring AEM folder exists: ${relDirPosix}`));
    await ensureAemFolderExists({
      urlPrefix,
      relativeFolderPosix: relDirPosix,
      headers,
    });
  }

  const relEncoded = (relDirPosix && relDirPosix !== '.')
    ? encodePathSegments(relDirPosix)
    : '';

  // DirectBinaryUpload expects the target asset URL under /content/dam: it initiates the upload
  // on the parent folder (<folder>.initiateUpload.json), so this must not be an Assets API URL.
  const baseFolderUrl = relEncoded
    ? `${urlPrefix}/${relEncoded}`
    : urlPrefix;

  // Build list of upload items with explicit destination URLs
  const uploadItems = [];
  for (const filePath of files) {
    const st = await fs.stat(filePath);
    uploadItems.push({
      filePath,
      fileSize: st.size,
      fileUrl: `${baseFolderUrl}/${encodeURIComponent(path.basename(filePath))}`,
      replace,
    });
  }

  const totalFiles = uploadItems.length;
  const totalBatches = Math.ceil(totalFiles / maxFilesPerBatch);
  
  console.log(chalk.cyan(`Uploading ${totalFiles} file(s) from ${relDirPosix || '/'} in ${totalBatches} batch(es)...`));
  console.log(chalk.cyan(`Concurrency: ${maxConcurrent} simultaneous uploads per batch`));

  // Upload in bounded chunks
  const results = [];
  for (let i = 0; i < uploadItems.length; i += maxFilesPerBatch) {
    const batch = uploadItems.slice(i, i + maxFilesPerBatch);
    const batchNumber = Math.floor(i / maxFilesPerBatch) + 1;

    console.log(chalk.cyan(`  Batch ${batchNumber}/${totalBatches}: Uploading ${batch.length} file(s)...`));

    const opts = new DirectBinaryUploadOptions()
      .withUrl(urlPrefix)
      .withMaxConcurrent(maxConcurrent)
      .withHttpOptions({ headers })
      .withUploadFiles(batch);

    try {
      const upload = new DirectBinaryUpload();
      
      // Track file index within batch for progress
      let fileIndex = 0;
      const batchSize = batch.length;
      
      // Add event handlers for per-file progress
      upload.on('filestart', (data) => {
        fileIndex++;
        const filePath = data.fileName || data.filePath || 'unknown';
        const fileName = path.basename(filePath);
        const relPath = path.relative(rootDir, filePath);
        console.log(chalk.gray(`    [${fileIndex}/${batchSize}] → Uploading: ${fileName} (${relPath})`));
      });
      
      upload.on('fileend', (data) => {
        const filePath = data.fileName || data.filePath || 'unknown';
        const fileName = path.basename(filePath);
        const relPath = path.relative(rootDir, filePath);
        console.log(chalk.green(`    [${fileIndex}/${batchSize}] ✓ Uploaded: ${fileName} (${relPath})`));
      });
      
      upload.on('fileerror', (data) => {
        const filePath = data.fileName || data.filePath || 'unknown';
        const fileName = path.basename(filePath);
        const relPath = path.relative(rootDir, filePath);
        const errorMsg = formatErrors(data.errors) || 'Unknown error';
        console.error(chalk.red(`    [${fileIndex}/${batchSize}] ✗ Failed: ${fileName} (${relPath}) - ${errorMsg}`));
      });
      
      const completedFiles = trackCompletedFiles(upload);
      let result;
      try {
        result = await upload.uploadFiles(opts);
      } finally {
        completedFiles.stop();
      }

      // Files that never completed (errored, or skipped after an upload-level error) are failures.
      const filesUploaded = completedFiles.count();
      const filesFailed = Math.max(batch.length - filesUploaded, 0);
      const errors = (result?.errors || []).map((e) => e?.message || String(e));

      const summary = `${filesUploaded} successful${filesFailed > 0 ? `, ${filesFailed} failed` : ''}`;
      if (filesFailed > 0 || errors.length > 0) {
        console.error(chalk.red(`  Batch ${batchNumber}/${totalBatches} complete: ${summary}${errors.length ? ` - ${errors.join(', ')}` : ''}`));
      } else {
        console.log(chalk.green(`  Batch ${batchNumber}/${totalBatches} complete: ${summary}`));
      }

      results.push({
        batchNumber,
        filesInBatch: batch.length,
        filesUploaded,
        filesFailed,
        errors,
        result,
      });
    } catch (error) {
      console.error(chalk.red(`  Batch ${batchNumber}/${totalBatches} failed: ${error.message}`));
      results.push({
        batchNumber,
        filesInBatch: batch.length,
        filesUploaded: 0,
        filesFailed: batch.length,
        errors: [error.message],
      });
    }
  }

  return results;
}