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

import path from 'path';
import { downloadAssets, IMAGE_EXTENSIONS } from '../utils/download-assets.js';
import { uploadFolder } from './upload.js';
import { sanitizeFilename, getFilename, extractPageParentPath } from './url-utils.js';

/**
 * Check if a file is an image based on its extension
 * @param {string} filename - The filename to check
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {boolean} True if the file is an image
 */
export function isImageAsset(filename, dependencies = {}) {
  const pathDep = dependencies?.path || path;
  const ext = pathDep.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Create a mapping of asset URLs to their target paths in DA
 * Images go to shadow folders, non-images go to media folders under parent
 * @param {Array<string>} matchingHrefs - Array of asset URLs to map
 * @param {string} fullShadowPath - The full shadow folder path (format: {relativePath}/.{pageName} or .{pageName})
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Map<string, string>} Map of asset URL to target path
 */
export function createAssetMapping(matchingHrefs, fullShadowPath, dependencies = {}) {
  // Extract page parent path from fullShadowPath
  const pageParentPath = extractPageParentPath(fullShadowPath);
  
  return new Map(
    matchingHrefs.map((url) => {
      const filename = getFilename(url);
      const parts = filename.split('.');
      const ext = parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';
      const base = parts.join('.');
      const sanitizedBase = sanitizeFilename(base);
      const sanitizedFilename = `${sanitizedBase}${ext}`;
      
      // Determine if this is an image asset
      const isImage = isImageAsset(filename, dependencies);
      
      if (isImage) {
        // Images go to shadow folder path
        return [url, `/${fullShadowPath}/${sanitizedFilename}`];
      } else {
        // Non-images go to media folder under the parent directory
        return [url, pageParentPath ? `/${pageParentPath}/media/${sanitizedFilename}` : `/media/${sanitizedFilename}`];
      }
    }),
  );
}

/**
 * Download assets for a page using the asset mapping
 * @param {Array<string>} matchingHrefs - Array of asset URLs to download
 * @param {string} fullShadowPath - The full shadow folder path (format: {relativePath}/.{pageName} or .{pageName})
 * @param {string} downloadFolder - Base download folder
 * @param {number} maxRetries - Maximum retries for download
 * @param {number} retryDelay - Delay between retries
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<{downloadResults: Array, assetMapping: Map}>} Download results and asset mapping
 */
export async function downloadPageAssets(matchingHrefs, fullShadowPath, downloadFolder, maxRetries, retryDelay, dependencies = {}) {
  const chalkDep = dependencies.chalk;
  const downloadAssetsFn = dependencies.downloadAssets || downloadAssets;
  
  const simplifiedAssetMapping = createAssetMapping(matchingHrefs, fullShadowPath, dependencies);
  
  console.log(chalkDep.yellow(`Downloading ${simplifiedAssetMapping.size} unique assets for this page...`));

  const downloadResults = await downloadAssetsFn(simplifiedAssetMapping, downloadFolder, maxRetries, retryDelay);

  // Count successful downloads
  const successfulDownloads = downloadResults.filter(result => result.status === 'fulfilled').length;
  const failedDownloads = downloadResults.filter(result => result.status === 'rejected').length;

  console.log(chalkDep.green(`Successfully downloaded ${successfulDownloads} assets`));
  if (failedDownloads > 0) {
    console.log(chalkDep.red(`Failed to download ${failedDownloads} assets`));
  }

  return { downloadResults, assetMapping: simplifiedAssetMapping };
}

/**
 * Upload assets for a page to DA, handling separate paths for images vs non-images
 * @param {Map} assetMapping - Map of original URLs to their target paths
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} downloadFolder - Base download folder
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
export async function uploadPageAssets(assetMapping, daAdminUrl, token, uploadOptions, downloadFolder, dependencies = {}) {
  const chalkDep = dependencies.chalk;
  const uploadFolderFn = dependencies.uploadFolder || uploadFolder;
  const fsDep = dependencies.fs;
  const pathDep = dependencies.path || path;

  // Group assets by their target folders
  const folderGroups = new Map();
  
  for (const [originalUrl, targetPath] of assetMapping) {
    const targetFolder = pathDep.dirname(targetPath);
    if (!folderGroups.has(targetFolder)) {
      folderGroups.set(targetFolder, []);
    }
    folderGroups.get(targetFolder).push({ originalUrl, targetPath });
  }

  console.log(chalkDep.yellow(`Uploading assets to ${folderGroups.size} different folder(s)...`));

  try {
    // Upload each folder group separately
    for (const [targetFolder, assets] of folderGroups) {
      const localFolderPath = pathDep.join(downloadFolder, targetFolder);
      
      if (fsDep && fsDep.existsSync(localFolderPath)) {
        // Determine asset type based on folder path
        const isMediaFolder = targetFolder.endsWith('/media') || targetFolder.endsWith('\\media');
        const assetType = isMediaFolder ? 'non-image asset(s)' : 'image(s)';
        
        console.log(chalkDep.cyan(`Uploading ${assets.length} ${assetType} from ${targetFolder}/`));
        
        await uploadFolderFn(localFolderPath, daAdminUrl, token, {
          ...uploadOptions,
          baseFolder: downloadFolder,
        });
      }
    }
    
    console.log(chalkDep.green('Successfully uploaded all page assets'));
  } catch (uploadError) {
    console.error(chalkDep.red('Error uploading assets for page', uploadError.message));
    throw uploadError;
  }
}

