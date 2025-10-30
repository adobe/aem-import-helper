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
import fs from 'fs';
import { downloadAssets, IMAGE_EXTENSIONS } from '../utils/download-assets.js';
import { uploadFolder } from './upload.js';
import { getSanitizedFilenameFromUrl, extractPageParentPath } from './url-utils.js';

// Status constants for asset operations
export const DOWNLOAD_STATUS = {
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
};

export const COPY_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
};

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
 * Images go to shadow folders, non-images go to shared-media folders under parent
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
      const sanitizedFilename = getSanitizedFilenameFromUrl(url);
      
      // Determine if this is an image asset
      const isImage = isImageAsset(sanitizedFilename, dependencies);
      
      if (isImage) {
        // Images go to shadow folder path
        return [url, `/${fullShadowPath}/${sanitizedFilename}`];
      } else {
        // Non-images go to shared-media folder under the parent directory
        return [url, pageParentPath ? `/${pageParentPath}/shared-media/${sanitizedFilename}` : `/shared-media/${sanitizedFilename}`];
      }
    }),
  );
}

/**
 * Download assets for a page using the asset mapping
 * @param {Array<string>} matchingHrefs - Array of asset URLs to download
 * @param {string} fullShadowPath - The full shadow folder path (format: {relativePath}/.{pageName} or .{pageName})
 * @param {string} downloadFolder - The folder where origin assets are downloaded into
 * @param {Object} options - Download options
 * @param {number} options.maxRetries - Maximum retries for download (default: 3)
 * @param {number} options.retryDelay - Delay between retries (default: 1000)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<{downloadResults: Array, assetMapping: Map}>} Download results and asset mapping
 */
export async function downloadPageAssets(
  matchingHrefs,
  fullShadowPath,
  downloadFolder,
  options = {},
  dependencies = {},
) {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  const chalkDep = dependencies.chalk;
  const downloadAssetsFn = dependencies.downloadAssets || downloadAssets;
  
  const simplifiedAssetMapping = createAssetMapping(matchingHrefs, fullShadowPath, dependencies);
  
  console.log(chalkDep.yellow(`Downloading ${simplifiedAssetMapping.size} unique assets for this page...`));

  const downloadResults = await downloadAssetsFn(simplifiedAssetMapping, downloadFolder, maxRetries, retryDelay);

  // Count successful downloads
  const successfulDownloads = downloadResults.filter(result => result.status === DOWNLOAD_STATUS.FULFILLED).length;
  const failedDownloads = downloadResults.filter(result => result.status === DOWNLOAD_STATUS.REJECTED).length;

  console.log(chalkDep.green(`Successfully downloaded ${successfulDownloads} assets`));
  if (failedDownloads > 0) {
    console.log(chalkDep.red(`Failed to download ${failedDownloads} assets`));
  }

  return { downloadResults, assetMapping: simplifiedAssetMapping };
}

/**
 * Copy local assets from a local folder to the download folder structure
 * @param {Array<string>} matchingHrefs - Asset URL references from HTML (e.g., './hero/banner.jpg', '/logo.png')
 * @param {string} fullShadowPath - The full shadow folder path (format: {relativePath}/.{pageName} or .{pageName})
 * @param {string} downloadFolder - The folder where processed assets will be copied to
 * @param {string} localAssetsPath - Root directory containing your source assets (the --local-assets folder)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<{copyResults: Array, assetMapping: Map}>} Object containing:
 *   - copyResults: Array of {status: 'success'|'error', path|error} for each copy operation
 *   - assetMapping: Map of original URL → target path
 */
export async function copyLocalPageAssets(
  matchingHrefs,
  fullShadowPath,
  downloadFolder,
  localAssetsPath,
  dependencies = {},
) {
  const chalkDep = dependencies.chalk;
  const fsDep = dependencies.fs || fs;
  const pathDep = dependencies.path || path;
  
  const simplifiedAssetMapping = createAssetMapping(matchingHrefs, fullShadowPath, dependencies);
  
  console.log(chalkDep.yellow(`Copying ${simplifiedAssetMapping.size} unique local assets for this page...`));

  const copyResults = [];
  
  for (const [assetUrl, targetPath] of simplifiedAssetMapping) {
    try {
      // Convert the asset URL to a local file path
      // Remove leading slash and any protocol/host if present
      let localPath = assetUrl;
      
      // If it's a full URL (http/https), extract the path portion
      if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
        const urlObj = new URL(assetUrl);
        localPath = urlObj.pathname;
      }
      
      // Remove leading ./ or /
      // Asset references are expected to be relative to the --local-assets folder
      localPath = localPath.replace(/^\.\/+/, '').replace(/^\/+/, '');
      
      // Check if the path starts with a directory that matches the last segment of localAssetsPath
      // e.g., if localAssetsPath is "/data/images" and localPath is "images/home/icon.png"
      // we should strip the redundant "images/" to get "home/icon.png"
      const localAssetsDirName = pathDep.basename(localAssetsPath);
      if (localPath.startsWith(localAssetsDirName + '/') || localPath.startsWith(localAssetsDirName + pathDep.sep)) {
        localPath = localPath.substring(localAssetsDirName.length + 1);
      }
      
      // Construct the full local asset path
      const fullLocalPath = pathDep.join(localAssetsPath, localPath);      
      // Check if the local file exists
      if (!fsDep.existsSync(fullLocalPath)) {
        console.warn(chalkDep.yellow(`Warning: Local asset not found: ${fullLocalPath}`));
        copyResults.push({ status: COPY_STATUS.ERROR, error: new Error(`File not found: ${fullLocalPath}`) });
        continue;
      }
      
      // Construct the destination path
      const destPath = pathDep.join(downloadFolder, targetPath);
      // Create the destination directory
      fsDep.mkdirSync(pathDep.dirname(destPath), { recursive: true });
      
      // Copy the file to the destination path
      fsDep.copyFileSync(fullLocalPath, destPath);
      
      copyResults.push({ status: COPY_STATUS.SUCCESS, path: destPath });
    } catch (error) {
      console.error(chalkDep.red(`Error copying local asset ${assetUrl}:`, error.message));
      copyResults.push({ status: COPY_STATUS.ERROR, error });
    }
  }

  // Count successful copies
  const successfulCopies = copyResults.filter(result => result.status === COPY_STATUS.SUCCESS).length;
  const failedCopies = copyResults.filter(result => result.status === COPY_STATUS.ERROR).length;

  console.log(chalkDep.green(`Successfully copied ${successfulCopies} local assets`));
  if (failedCopies > 0) {
    console.log(chalkDep.red(`Failed to copy ${failedCopies} local assets`));
  }

  return { copyResults, assetMapping: simplifiedAssetMapping };
}

/**
 * Upload assets for a page to DA, handling separate paths for images vs non-images
 * @param {Map} assetMapping - Map of original URLs to their target paths
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} downloadFolder - The folder where origin assets are downloaded into
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
export async function uploadPageAssets(
  assetMapping,
  daAdminUrl,
  token,
  uploadOptions,
  downloadFolder,
  dependencies = {},
) {
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
        const isMediaFolder = targetFolder.endsWith('/shared-media') || targetFolder.endsWith('\\shared-media');
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

