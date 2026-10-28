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
import { FileSystemUploadOptions } from '@adobe/aem-upload';
import {
  encodePathSegments, toPosix, trackCompletedFiles, uploadFlatDirInBatches,
} from './aem-upload-fallback.js';

async function listImmediateSubdirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

/**
 * FileSystemUpload uploads a directory as a child of the options URL. The root directory targets
 * urlPrefix; a sub-directory reached by splitting must target its parent folder under urlPrefix.
 */
function uploadOptionsForDir(options, urlPrefix, assetRootDir, dir) {
  if (dir === assetRootDir) {
    return options;
  }
  const parentRel = toPosix(path.relative(path.dirname(assetRootDir), path.dirname(dir)));
  return FileSystemUploadOptions.fromOptions(options)
    .withUrl(`${urlPrefix}/${encodePathSegments(parentRel)}`);
}

function isTooLargeError(e) {
  if (!e) return false;
  if (e.code === 'TOO_LARGE') return true;
  const msg = String(e.message || '');
  return msg.includes('exceeded maximum') || msg.includes('Walked directory exceeded');
}

/**
 * Normalize a FileSystemUpload result: FileSystemUpload does not throw when files fail, it reports
 * totalFiles and upload-level errors. Successful files are counted from 'fileend' events because
 * the result's totalCompleted is unreliable (see trackCompletedFiles).
 * @param {object} res - The FileSystemUpload result.
 * @param {string} dirPath - The uploaded directory.
 * @param {number|null} filesUploaded - Files that completed, or null if they could not be counted.
 * @return {{run: object, error: ({type: string, path: string, message: string}|null)}}
 */
function checkFilesystemRun(res, dirPath, filesUploaded) {
  const totalFiles = Number.isFinite(res?.totalFiles) ? res.totalFiles : null;
  const filesFailed = totalFiles !== null && filesUploaded !== null ? Math.max(totalFiles - filesUploaded, 0) : 0;
  const uploadErrors = (Array.isArray(res?.errors) ? res.errors : []).map((e) => e?.message || String(e));

  const run = totalFiles === null || filesUploaded === null ? res : { ...res, filesUploaded, filesFailed };
  if (filesFailed === 0 && uploadErrors.length === 0) {
    return { run, error: null };
  }

  const parts = [];
  if (filesFailed > 0) parts.push(`${filesFailed} of ${totalFiles} file(s) failed to upload`);
  parts.push(...uploadErrors);
  return { run, error: { type: 'filesystem-upload', path: dirPath, message: parts.join('; ') } };
}

/**
 * Collect the failed batches of uploadFlatDirInBatches as orchestrator errors.
 */
function fallbackBatchErrors(batches, dirPath, type) {
  return (batches || [])
    .filter((b) => b.filesFailed > 0 || b.errors?.length > 0)
    .map((b) => ({
      type,
      path: dirPath,
      message: `batch ${b.batchNumber}: ${b.filesFailed} of ${b.filesInBatch} file(s) failed to upload`
        + `${b.errors?.length ? `; ${b.errors.join('; ')}` : ''}`,
    }));
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   filesystemRuns: any[],
 *   fallbackRuns: any[],
 *   errors: Array<{type: string, path: string, message: string}>
 * }>}
 */
export async function uploadDirWithSplitAndFallback({
  fileUpload,
  options,
  urlPrefix,
  headers,
  assetRootDir,
  dir,
  onError = (err, context) => {
    console.error(`Upload error (${context.type}) for ${context.path}:`, err?.message || err);
  },
}) {
  const filesystemRuns = [];
  const fallbackRuns = [];
  const errors = [];

  const queue = [dir];
  
  console.log(chalk.cyan(`\nStarting AEM asset upload from: ${assetRootDir}`));
  console.log(chalk.cyan(`Target: ${urlPrefix}`));
  console.log('');

  while (queue.length) {
    const current = queue.shift();
    const relPath = path.relative(assetRootDir, current);
    const displayPath = relPath || '/';

    try {
      const completedFiles = typeof fileUpload.on === 'function' ? trackCompletedFiles(fileUpload) : null;
      let res;
      try {
        res = await fileUpload.upload(uploadOptionsForDir(options, urlPrefix, assetRootDir, current), [current]);
      } finally {
        completedFiles?.stop();
      }
      const { run, error } = checkFilesystemRun(res, current, completedFiles ? completedFiles.count() : null);
      filesystemRuns.push(run);
      if (error) {
        console.error(chalk.red(`✗ Some files failed to upload from: ${displayPath} - ${error.message}`));
        errors.push(error);
      }
      continue;
    } catch (e) {
      if (isTooLargeError(e)) {
        console.log(chalk.yellow(`⚠ Directory too large, switching to fallback mode: ${displayPath}`));
        console.log(chalk.gray(`   Reason: ${e.message || 'Exceeded FileSystemUpload limits'}`));
        
        let children = [];
        try {
          children = await listImmediateSubdirs(current);
        } catch (readdirErr) {
          errors.push({ type: 'list-subdirs', path: current, message: String(readdirErr?.message || readdirErr) });
          onError(readdirErr, { path: current, type: 'list-subdirs' });
          continue;
        }

        if (children.length) {
          // Directory has subdirectories - split into them
          // But first, upload any files at THIS level using fallback
          console.log(chalk.cyan(`Found ${children.length} subdirectory(ies), processing parent files first...`));
          
          try {
            const fallbackResult = await uploadFlatDirInBatches({
              localDir: current,
              rootDir: assetRootDir,
              urlPrefix,
              headers,
              replace: true,
              maxConcurrent: options.getMaxConcurrent ? options.getMaxConcurrent() : 5,
              maxFilesPerBatch: 200,
            });

            // uploadFlatDirInBatches only uploads files (not subdirectories)
            // and returns undefined if no files, so check before pushing
            if (fallbackResult && fallbackResult.length > 0) {
              fallbackRuns.push(...fallbackResult);
              errors.push(...fallbackBatchErrors(fallbackResult, current, 'fallback-parent-files'));
            }
          } catch (fallbackErr) {
            errors.push({ type: 'fallback-parent-files', path: current, message: String(fallbackErr?.message || fallbackErr) });
            onError(fallbackErr, { path: current, type: 'fallback-parent-files' });
          }

          // Now add subdirectories to queue for processing
          console.log(chalk.cyan(`Queuing ${children.length} subdirectory(ies) for processing...`));
          queue.push(...children);
          continue;
        }

        // Flat directory too large => file-level fallback
        console.log(chalk.cyan('Flat directory, using batch upload...'));
        
        try {
          const fallbackResult = await uploadFlatDirInBatches({
            localDir: current,
            rootDir: assetRootDir,
            urlPrefix,
            headers,
            replace: true,
            maxConcurrent: options.getMaxConcurrent ? options.getMaxConcurrent() : 5,
            maxFilesPerBatch: 200,
          });

          // uploadFlatDirInBatches will return an array of per-batch results (see updated file below)
          fallbackRuns.push(...(fallbackResult || []));
          errors.push(...fallbackBatchErrors(fallbackResult, current, 'fallback-flatdir'));
        } catch (fallbackErr) {
          errors.push({ type: 'fallback-flatdir', path: current, message: String(fallbackErr?.message || fallbackErr) });
          onError(fallbackErr, { path: current, type: 'fallback-flatdir' });
        }

        continue;
      }

      console.error(chalk.red(`✗ Failed to upload directory: ${displayPath} - ${e.message}`));
      errors.push({ type: 'filesystem-upload', path: current, message: String(e?.message || e) });
      onError(e, { path: current, type: 'filesystem-upload' });
    }
  }
  
  console.log('');

  return {
    ok: errors.length === 0,
    filesystemRuns,
    fallbackRuns,
    errors,
  };
}