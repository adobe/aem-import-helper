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
 * Function to ensure directory exists
 */
export function ensureDirSync(directoryPath) {
  try {
    // Create the directory if it doesn't exist, including parent directories
    fs.mkdirSync(directoryPath, { recursive: true });
  } catch (err) {
    console.error(chalk.red('Error ensuring directory exists:', err));
  }
}

/**
 * Function to download an asset with retry.
 *
 * @param {{maxRetries: number}} opts - Additional options for downloading the asset
 * @param {string} assetUrl - The URL of the asset to download
 * @param {string} jcrPath - The JCR path of the asset
 * @param {number} retryDelay - The delay between retries in milliseconds defaults to 5000
 */

export async function downloadAsset(opts, assetUrl, jcrPath, retryDelay = 5000) {
  const { maxRetries } = opts;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(assetUrl);

      if (!response.ok) {
        const msg = `Failed to fetch ${assetUrl}. Status: ${response.status}.`;
        console.info(chalk.yellow(msg));
        throw new Error(msg);
      }

      // Create the asset path
      let assetPath = path.join(process.cwd(), jcrPath.replace(CONTENT_DAM_PREFIX, ''));

      ensureDirSync(path.dirname(assetPath));

      // Read response body as a stream and write it to the file
      const fileStream = fs.createWriteStream(assetPath);
      const reader = response.body.getReader();

      await new Promise((resolve, reject) => {
        function processChunk({ done, value }) {
          if (done) {
            fileStream.end();
            resolve();
            return;
          }
          fileStream.write(value);
          reader.read().then(processChunk).catch(reject);
        }
        reader.read().then(processChunk).catch(reject);
        fileStream.on('error', reject);
      });

      console.info(chalk.yellow(`Downloaded ${assetUrl} successfully.`));
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(chalk.red(`Failed to download ${assetUrl} after ${maxRetries} attempts.`));
        throw error;
      } else {
        console.info(chalk.yellow(`Retrying download (${attempt}/${maxRetries})...`));

        // Exponential backoff
        const delay = retryDelay * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Function to download all assets to given location.
 *
 * @param opts - Options for downloading the assets
 * @param assetUrlMap - The map of asset urls to their JCR node paths
 * @returns {Promise<void>} A promise that resolves when all assets are downloaded
 */
export async function downloadAssets(opts, assetUrlMap) {
  // Map over the entries and create a promise for each asset download.
  const downloadPromises = Array.from(assetUrlMap.entries()).map(([assetUrl, jcrPath]) =>
    downloadAsset(opts, assetUrl, jcrPath),
  );

  // Wait for all downloads to complete
  // The promises are passed to Promise.allSettled, which runs them in parallel
  await Promise.allSettled(downloadPromises);
}

/**
 * Get a map of asset URLs to JCR node paths from a JSON file.
 * @param {string} assetMappingFilePath - The path to the JSON file containing asset URLs and JCR node paths
 * @returns {Map<string, string> | undefined} a map of asset URLs to JCR node paths, or undefined if the file is invalid
 */
export function getAssetUrlMap(assetMappingFilePath) {
  try {
    const data = fs.readFileSync(assetMappingFilePath, 'utf8');
    const jsonData = JSON.parse(data);

    if (typeof jsonData === 'object' && jsonData !== null) {
      return new Map(Object.entries(jsonData));
    }

    // Return undefined if jsonData isn't valid
    return undefined;
  } catch (err) {
    // Return undefined if there's an error reading the file or parsing JSON
    return undefined;
  }
}

/**
 * Function to download assets present in given markdown file.
 *
 * @param opts - The options for downloading assets
 * @param assetMappingFilePath - The file containing mappings of asset urls to their JCR node paths
 * @returns {Promise<void>}
 */
export async function downloadAssetsInMarkdown(opts, assetMappingFilePath) {
  const assetUrlMap = getAssetUrlMap(assetMappingFilePath);

  // Process the Map entries
  await downloadAssets(opts, assetUrlMap);
}
