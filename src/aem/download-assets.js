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

/**
 * Save the given blob to a file in the download folder.
 * @param {Blob} blob - The blob to save.
 * @param {string} jcrPath - The JCR path of the asset.
 * @param {string} downloadFolder - The folder to download assets to.
 * @return {Promise<void>} A promise that resolves when the blob is saved to a file.
 */
async function saveBlobToFile(blob, jcrPath, downloadFolder) {
  let assetPath = path.join(downloadFolder, jcrPath.replace(CONTENT_DAM_PREFIX, ''));
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });

  const buffer = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(assetPath, buffer);
}

/**
 * Download the given asset URL to the download folder.
 * @param {string} url - The URL of the asset to download.
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {number} retryDelay - The delay between retries in milliseconds.
 * @return {Promise<Blob>} A promise that resolves with the downloaded asset.
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
      return await response.blob();
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
 * @param {number} maxRetries - The maximum number of retries for downloading an asset.
 * @param {Map<string, string>} assetMapping - The content of the asset mapping file.
 * @param downloadFolder - The folder to download assets to.
 * @returns {Promise<void>} A promise that resolves when all assets are downloaded.
 */
export async function downloadAssets(maxRetries, assetMapping, downloadFolder) {
  const downloadPromises = Array.from(assetMapping.entries())
    .map(async ([assetUrl, jcrPath]) => {
      const blob = await downloadAssetWithRetry(assetUrl);
      await saveBlobToFile(blob, jcrPath, downloadFolder);
    });

  await Promise.allSettled(downloadPromises);
}

/**
 * Function to clean up the asset folder.
 * @param assetFolder
 * @return {Promise<void>}
 */
export async function cleanup(assetFolder) {
  await fs.promises.rm(assetFolder, { recursive: true, force: true });
}
