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

// Maximum concurrent downloads to prevent overwhelming the origin server
// and avoid being blocked or rate-limited
export const MAX_CONCURRENT_DOWNLOADS = 10;

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
 * @param {boolean} [options.useCache=false] - Whether to use local cache (skip if file exists)
 * @return {Promise<{cached: boolean}>} A promise that resolves when the blob is saved or skipped (if cached).
 */
async function saveBlobToFile(blob, downloadPath, downloadFolder, contentType, options = {}) {
  let assetPath = path.join(downloadFolder, downloadPath.replace(CONTENT_DAM_PREFIX, ''));
  
  // Check if file exists and cache is enabled
  if (options.useCache && fs.existsSync(assetPath)) {
    return { cached: true };
  }

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
      
      // Check cache again with the updated .png path
      if (options.useCache && fs.existsSync(assetPath)) {
        return { cached: true };
      }
      
      fs.writeFileSync(assetPath, pngBuffer);
      return { cached: false };
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
      
      // Check cache again with the updated extension
      if (options.useCache && fs.existsSync(assetPath)) {
        return { cached: true };
      }
      
      fs.writeFileSync(assetPath, sourceBuffer);
      return { cached: false };
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
  
  // Check cache one more time with final path
  if (options.useCache && fs.existsSync(assetPath)) {
    return { cached: true };
  }
  
  fs.writeFileSync(assetPath, sourceBuffer);
  return { cached: false };
}

/**
 * Download the given asset URL to the download folder.
 * @param {string} url - The URL of the asset to download.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @param {Object} [headers={}] - Additional headers to include in the request.
 * @param {number} [assetIndex] - The current asset index for logging
 * @param {number} [totalAssets] - The total number of assets for logging
 * @return {Promise<{blob: Blob, contentType: string}>} A promise that resolves with the downloaded asset and its content type.
 */
async function downloadAssetWithRetry(url, maxRetries = 3, retryDelay = 5000, headers = {}, assetIndex, totalAssets) {
  let attempts = 0;
  
  // Log download start
  if (assetIndex !== undefined && totalAssets !== undefined) {
    console.log(chalk.cyan(`[${assetIndex}/${totalAssets}] Downloading: ${url}`));
  }
  
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
      
      // Log successful download
      if (assetIndex !== undefined && totalAssets !== undefined) {
        console.log(chalk.green(`[${assetIndex}/${totalAssets}] ✓ Downloaded successfully`));
      }
      
      return { blob, contentType };
    } catch (error) {
      if (error.message.includes('404')) {
        // we should skip 404 errors
        console.info(chalk.yellow(`Skipping 404 error for ${url}`));
        return { blob: null, contentType: null };
      }
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
 * Function to download assets from the asset mapping file with concurrency control.
 * Downloads are processed in batches to avoid overwhelming the origin server
 * and prevent being blocked or rate-limited.
 * @param {Map<string, string>} assetMapping - The content of the asset mapping file.
 * @param {string} downloadFolder - The folder to download assets to.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @param {Object} [headers={}] - Additional headers to include in the request.
 * @param {Object} [options={}] - Options for the function
 * @param {boolean} [options.convertImagesToPng=false] - Whether to convert images to PNG
 * @param {number} [options.maxConcurrentDownloads=10] - Maximum number of concurrent downloads
 * @return {Promise<Array<PromiseSettledResult<string>>>} Array of settled promises with status 'fulfilled' | 'rejected'.
 * Use DOWNLOAD_STATUS constants to check the status field.
 */
export async function downloadAssets(assetMapping, downloadFolder, maxRetries = 3, retryDelay = 5000, headers = {}, options = {}) {
  const totalAssets = assetMapping.size;
  const maxConcurrentDownloads = options.maxConcurrentDownloads || MAX_CONCURRENT_DOWNLOADS;
  
  // Check for cache environment variable
  const useCache = process.env.USE_DOWNLOAD_CACHE === 'true';
  if (useCache) {
    options.useCache = true;
  }
  
  // Log download start summary
  console.log(chalk.cyan(`\nStarting download of ${totalAssets} asset(s)...`));
  console.log(chalk.cyan(`Download folder: ${downloadFolder}`));
  console.log(chalk.cyan(`Concurrency limit: ${maxConcurrentDownloads} simultaneous downloads`));
  if (options.convertImagesToPng) {
    console.log(chalk.cyan('Image conversion to PNG: enabled'));
  }
  if (useCache) {
    console.log(chalk.gray('Cache: enabled (skipping existing files)'));
  }
  console.log('');
  
  const entries = Array.from(assetMapping.entries());
  const allResults = [];
  
  // Process downloads in batches to control concurrency
  const batchSize = maxConcurrentDownloads;
  const totalBatches = Math.ceil(entries.length / batchSize);
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    console.log(chalk.cyan(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} asset(s))...`));
    
    // Download assets in current batch concurrently
    const batchPromises = batch.map(async ([assetUrl, downloadPath], batchIndex) => {
      const assetIndex = i + batchIndex + 1;
      
      // Check cache before downloading
      if (options.useCache) {
        const tempPath = path.join(downloadFolder, downloadPath.replace(CONTENT_DAM_PREFIX, ''));
        if (fs.existsSync(tempPath)) {
          console.log(chalk.gray(`[${assetIndex}/${totalAssets}] cached: ${path.basename(tempPath)}`));
          return { downloadPath, cached: true };
        }
      }
      
      const { blob, contentType } = await downloadAssetWithRetry(assetUrl, maxRetries, retryDelay, headers, assetIndex, totalAssets);
      const result = await saveBlobToFile(blob, downloadPath, downloadFolder, contentType, options);
      return { downloadPath, cached: result?.cached || false };
    });
    
    // Wait for current batch to complete
    const batchResults = await Promise.allSettled(batchPromises);
    allResults.push(...batchResults);
    
    // Log batch summary
    const batchSuccess = batchResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED).length;
    const batchFailed = batchResults.filter(r => r.status === DOWNLOAD_STATUS.REJECTED).length;
    const batchCached = batchResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED && r.value?.cached).length;
    
    if (batchCached > 0 && options.useCache) {
      console.log(chalk.green(`Batch ${batchNumber} complete: ${batchSuccess} successful (${batchCached} cached)${batchFailed > 0 ? `, ${batchFailed} failed` : ''}`));
    } else {
      console.log(chalk.green(`Batch ${batchNumber} complete: ${batchSuccess} successful${batchFailed > 0 ? `, ${batchFailed} failed` : ''}`));
    }
    console.log('');
  }
  
  // Log overall summary
  const successful = allResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED).length;
  const failed = allResults.filter(r => r.status === DOWNLOAD_STATUS.REJECTED).length;
  const cached = allResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED && r.value?.cached).length;
  
  console.log(chalk.green('='.repeat(50)));
  console.log(chalk.green('Download Summary:'));
  console.log(chalk.green(`  Total assets: ${totalAssets}`));
  console.log(chalk.green(`  Successfully downloaded: ${successful}`));
  if (cached > 0 && options.useCache) {
    console.log(chalk.gray(`  Cached (skipped): ${cached}`));
  }
  if (failed > 0) {
    console.log(chalk.red(`  Failed downloads: ${failed}`));
  }
  console.log(chalk.green('='.repeat(50)));
  console.log('');
  
  return allResults;
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