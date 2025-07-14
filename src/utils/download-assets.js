/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const CONTENT_DAM_PREFIX = '/content/dam';

// Common MIME type to extension mapping
const MIME_TO_EXTENSION = {
  // Images
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/avif': '.avif',
  'image/apng': '.apng',
  // Documents
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/**
 * Save the given blob to a file in the download folder.
 * @param {Blob} blob - The blob to save.
 * @param {string} downloadPath - The path of the asset.
 * @param {string} downloadFolder - The folder to download assets to.
 * @param {string} contentType - The content type from the response headers.
 * @return {Promise<void>} A promise that resolves when the blob is saved to a file.
 */
async function saveBlobToFile(blob, downloadPath, downloadFolder, contentType) {
  let assetPath = path.join(downloadFolder, downloadPath.replace(CONTENT_DAM_PREFIX, ''));

  let extension = '';
  
  if (contentType) {
    // Extract the main MIME type (remove any parameters like charset)
    const mainType = contentType.split(';')[0].trim();
    extension = MIME_TO_EXTENSION[mainType] || '';
  }

  // If the file doesn't have an extension and we found one from content-type, append it
  if (extension && !path.extname(assetPath)) {
    assetPath += extension;
  }

  fs.mkdirSync(path.dirname(assetPath), { recursive: true });

  const buffer = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(assetPath, buffer);
}

/**
 * Download the given asset URL to the download folder.
 * @param {string} url - The URL of the asset to download.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @return {Promise<{blob: Blob, contentType: string}>} A promise that resolves with the downloaded asset and its content type.
 */
async function downloadAssetWithRetry(url, maxRetries = 3, retryDelay = 5000) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const msg = `Failed to fetch ${url}. Status: ${response.status}.`;
        console.info(chalk.yellow(msg));
        throw new Error(msg);
      }
      const contentType = response.headers.get('content-type');
      const blob = await response.blob();
      return { blob, contentType };
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        console.error(chalk.red(`Failed to download ${url} after ${maxRetries} attempts.`));
        throw error;
      }

      console.info(chalk.yellow(`Retrying download (${url}/${maxRetries})...`));
      const delay = retryDelay * 2 ** (attempts - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Function to download assets from the asset mapping file.
 * @param {Map<string, string>} assetMapping - The content of the asset mapping file.
 * @param {string} downloadFolder - The folder to download assets to.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @return {Promise<Array<PromiseSettledResult<string>>>} A promise that resolves when all assets are downloaded.
 * Each promise in the array will resolve with the path of the downloaded asset.
 */
export async function downloadAssets(assetMapping, downloadFolder, maxRetries = 3, retryDelay = 5000) {
  const downloadPromises = Array.from(assetMapping.entries())
    .map(async ([assetUrl, downloadPath]) => {
      const { blob, contentType } = await downloadAssetWithRetry(assetUrl, maxRetries, retryDelay);
      await saveBlobToFile(blob, downloadPath, downloadFolder, contentType);
      return downloadPath;
    });

  return Promise.allSettled(downloadPromises);
}

/**
 * Helper function to delete the given folder.
 * @param {string} folder - The folder to delete
 */
export function cleanup(folder) {
  if (fs.existsSync(folder)) {
    fs.rm(folder, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error(chalk.red(`Error deleting folder: ${folder}`, err));
      }
    })
  }
} 