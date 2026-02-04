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

function toPosix(p) {
  return p.replaceAll('\\', '/');
}

function encodePathSegments(posixPath) {
  return posixPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function folderApiUrl(urlPrefix, relativeFolderPosix) {
  const rel = encodePathSegments(relativeFolderPosix);
  return `${urlPrefix}/api/assets/${rel}`;
}

/**
 * Create an AEM Assets folder and all its parents under /content/dam using the Assets HTTP API.
 * Treats HTTP 409 as "already exists".
 */
export async function ensureAemFolderExists({
  urlPrefix,              // e.g. https://host/content/dam
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
 * @returns {Promise<any[]>} Array of batch results with metadata
 */
export async function uploadFlatDirInBatches({
  localDir,
  rootDir,           // original assetFolder root used to preserve structure
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

  const relDir = path.relative(rootDir, localDir);
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

  const baseFolderUrl = relEncoded
    ? `${urlPrefix}/api/assets/${relEncoded}`
    : `${urlPrefix}/api/assets`;

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
        const errorMsg = data.errors?.join(', ') || 'Unknown error';
        console.error(chalk.red(`    [${fileIndex}/${batchSize}] ✗ Failed: ${fileName} (${relPath}) - ${errorMsg}`));
      });
      
      const result = await upload.upload(opts);
      
      // Extract success/failure counts from result
      const uploaded = result?.filesUploaded || result?.totalFiles || batch.length;
      const failed = result?.filesFailed || 0;
      
      console.log(chalk.green(`  Batch ${batchNumber}/${totalBatches} complete: ${uploaded} successful${failed > 0 ? `, ${failed} failed` : ''}`));
      
      results.push({
        batchNumber,
        filesInBatch: batch.length,
        result,
      });
    } catch (error) {
      console.error(chalk.red(`  Batch ${batchNumber}/${totalBatches} failed: ${error.message}`));
      results.push({
        batchNumber,
        filesInBatch: batch.length,
        error: error.message,
      });
    }
  }

  return results;
}