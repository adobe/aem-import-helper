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
import sharp from 'sharp';

const CONTENT_DAM_PREFIX = '/content/dam';

// Image/file extension constants
export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.tiff', '.bmp', '.ico', '.heic', '.heif', '.avif', '.apng',
]);

// Promise.allSettled() result status constants
// These match the standard PromiseSettledResult type from Promise.allSettled()
export const DOWNLOAD_STATUS = {
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
};

// Extensions that should NOT be converted to PNG when conversion is enabled
export const DO_NOT_CONVERT_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.mp4', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

// Content-Types that should NOT be converted to PNG when conversion is enabled
export const DO_NOT_CONVERT_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'video/mp4',
]);

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
 * For image blobs, convert to PNG and force a .png extension.
 * @param {Blob} blob - The blob to save.
 * @param {string} downloadPath - The path of the asset.
 * @param {string} downloadFolder - The folder to download assets to.
 * @param {string} contentType - The content type from the response headers.
 * @param {Object} [options={}] - Options for the function
 * @param {boolean} [options.convertImagesToPng=false] - Whether to convert images to PNG
 * @return {Promise<void>} A promise that resolves when the blob is saved to a file.
 */
async function saveBlobToFile(blob, downloadPath, downloadFolder, contentType, options = {}) {
  let assetPath = path.join(downloadFolder, downloadPath.replace(CONTENT_DAM_PREFIX, ''));

  // Determine if this is an image either from content-type or the current extension
  const mainType = (contentType || '').split(';')[0].trim();
  const isImageByContentType = mainType.startsWith('image/');
  const currentExt = path.extname(assetPath).toLowerCase();
  const isImageByExt = IMAGE_EXTENSIONS.has(currentExt);

  const shouldConvert = options.convertImagesToPng
    && (isImageByContentType || isImageByExt)
    && !DO_NOT_CONVERT_EXTENSIONS.has(currentExt)
    && !(mainType && DO_NOT_CONVERT_CONTENT_TYPES.has(mainType));

  fs.mkdirSync(path.dirname(assetPath), { recursive: true });

  const sourceBuffer = Buffer.from(await blob.arrayBuffer());

  if (shouldConvert) {
    // Convert to PNG and force .png extension
    try {
      const pngBuffer = await sharp(sourceBuffer).png().toBuffer();
      const parsed = path.parse(assetPath);
      assetPath = path.join(parsed.dir, `${parsed.name}.png`);
      fs.writeFileSync(assetPath, pngBuffer);
      return;
    } catch (e) {
      // If conversion fails, fall back to saving the original buffer
      console.warn(chalk.yellow(`Warning: Failed to convert image to PNG for ${assetPath}. Saving original. ${e.message}`));
      // Ensure we still use a sensible extension if possible
      let extension = '';
      if (mainType) {
        extension = MIME_TO_EXTENSION[mainType] || '';
      }
      if (extension && !path.extname(assetPath)) {
        assetPath += extension;
      }
      fs.writeFileSync(assetPath, sourceBuffer);
      return;
    }
  }

  // Non-image or conversion disabled: retain original logic to add extension if missing
  let extension = '';
  if (mainType) {
    extension = MIME_TO_EXTENSION[mainType] || '';
  }
  if (extension && !path.extname(assetPath)) {
    assetPath += extension;
  }
  fs.writeFileSync(assetPath, sourceBuffer);
}

/**
 * Download the given asset URL to the download folder.
 * @param {string} url - The URL of the asset to download.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @param {Object} [headers={}] - Additional headers to include in the request.
 * @return {Promise<{blob: Blob, contentType: string}>} A promise that resolves with the downloaded asset and its content type.
 */
async function downloadAssetWithRetry(url, maxRetries = 3, retryDelay = 5000, headers = {}) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      // Default headers to mimic a browser request that works with protected sites
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*',
        'Referer': new URL(url).origin,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'no-cors',
        ...headers,
      };

      const response = await fetch(url, {
        headers: defaultHeaders,
      });
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
 * @param {Object} [headers={}] - Additional headers to include in the request.
 * @param {Object} [options={}] - Options for the function
 * @param {boolean} [options.convertImagesToPng=false] - Whether to convert images to PNG
 * @return {Promise<Array<PromiseSettledResult<string>>>} Array of settled promises with status 'fulfilled' | 'rejected'.
 * Use DOWNLOAD_STATUS constants to check the status field.
 */
export async function downloadAssets(assetMapping, downloadFolder, maxRetries = 3, retryDelay = 5000, headers = {}, options = {}) {
  const downloadPromises = Array.from(assetMapping.entries())
    .map(async ([assetUrl, downloadPath]) => {
      const { blob, contentType } = await downloadAssetWithRetry(assetUrl, maxRetries, retryDelay, headers);
      await saveBlobToFile(blob, downloadPath, downloadFolder, contentType, options);
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