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

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CONTENT_DAM_PREFIX = '/content/dam';

/**
 * Function to ensure directory exists
 */
function ensureDirSync(directoryPath) {
  try {
    // Create the directory if it doesn't exist, including parent directories
    fs.mkdirSync(directoryPath, { recursive: true });
  } catch (err) {
    console.error('Error ensuring directory exists:', err);
  }
}

/**
 * Function to download an image with retry.
 *
 * @param opts - Additional options for downloading the image
 * @param imageUrl - The URL of the image to download
 * @param jcrPath - The JCR path of the image
 */
async function downloadImage(opts, imageUrl, jcrPath) {
  const { maxRetries } = opts;
  const baseDelay = 5000; // base delay in milliseconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        const msg = `Failed to fetch ${imageUrl}. Status: ${response.status}.`;
        console.error(msg);
        throw new Error(msg);
      }

      // Create the image path
      let imagePath = path.join(process.cwd(), jcrPath.replace(CONTENT_DAM_PREFIX, ''));

      await ensureDirSync(path.dirname(imagePath));

      const writer = fs.createWriteStream(imagePath);
      return new Promise((resolve, reject) => {
        response.body.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`Failed to download ${imageUrl} after ${maxRetries} attempts.`);
        throw error;
      } else {
        console.info(`Retrying download (${attempt}/${maxRetries})...`);

        // Exponential backoff
        const delay = baseDelay * 2 ** (attempt - 1);
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }
  }
}

/**
 * Function to download all images to given location.
 *
 * @param opts - Options for downloading the images
 * @param imageUrlMap - The map of image urls to their JCR node paths
 * @returns {Promise<void>} A promise that resolves when all images are downloaded
 */
async function downloadImages(opts, imageUrlMap) {
  // Map over the entries and create a promise for each image download.
  const downloadPromises = Array.from(imageUrlMap.entries()).map(([imageUrl, jcrPath]) =>
    downloadImage(opts, imageUrl, jcrPath)
  );

  // Wait for all downloads to complete
  // The promises are passed to Promise.allSettled, which runs them in parallel
  await Promise.allSettled(downloadPromises);
}

/**
 * Get a map of image URLs to JCR node paths from a JSON file.
 * @param {string} jcrImageMappingFile - The path to the JSON file containing image URLs and JCR node paths
 * @returns {Map<string, string> | undefined} a map of image URLs to JCR node paths, or undefined if the file is invalid
 */
function getImageUrlMap(jcrImageMappingFile) {
  try {
    const data = fs.readFileSync(jcrImageMappingFile, 'utf8');
    const jsonData = JSON.parse(data);

    if (typeof jsonData === 'object' && jsonData !== null) {
      const map = new Map();

      // Convert JSON object to Map (assuming keys and values are strings)
      for (const [key, value] of Object.entries(jsonData)) {
        if (typeof key === 'string' && typeof value === 'string') {
          map.set(key, value);
        }
      }
      return map;
    }

    // Return undefined if jsonData isn't valid
    return undefined;
  } catch (err) {
    // Return undefined if there's an error reading the file or parsing JSON
    return undefined;
  }
};

/**
 * Function to download images present in given markdown file.
 *
 * @param opts - The options for downloading images
 * @param jcrImageMappingFile - The file containing mappings of image urls to their JCR node paths
 * @returns {Promise<void>}
 */
export default async function downloadImagesInMarkdown(opts, jcrImageMappingFile) {
  const imageUrlMap = getImageUrlMap(jcrImageMappingFile);

  // Process the Map entries
  await downloadImages(opts, imageUrlMap);
}
