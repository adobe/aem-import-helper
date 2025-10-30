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

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getAllFiles, uploadFolder } from './upload.js';

// Import functions from modular components
import {
  buildDaAdminUrl,
  buildDaContentUrl,
  buildDaListUrl,
  getFullyQualifiedAssetUrls,
} from './url-utils.js';

import {
  downloadPageAssets,
  copyLocalPageAssets,
  uploadPageAssets,
  DOWNLOAD_STATUS,
  COPY_STATUS,
} from './asset-processor.js';

import {
  extractUrlsFromHTML,
  updateAssetReferencesInHTML,
  updatePageReferencesInHTML,
  getSaveLocation,
  saveHtmlToDownloadFolder,
  uploadHTMLPage,
} from './html-processor.js';

// File encoding constant
const UTF8_ENCODING = 'utf-8';

const defaultDependencies = {
  fs,
  path,
  chalk,
  getAllFiles,
  uploadFolder,
};

/**
 * Process a single page - download assets, update HTML, upload everything
 * @param {string} pagePath - Path to the HTML page
 * @param {string} htmlContent - The HTML content
 * @param {Array<string>} assetUrls - Array of asset URLs
 * @param {string} siteOrigin - The site origin
 * @param {string} downloadFolder - Base download folder
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} htmlFolder - Base HTML folder
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<string>>} Array of matching asset URLs processed
 */
async function processSinglePage(
  pagePath,
  htmlContent,
  assetUrls,
  siteOrigin,
  downloadFolder,
  org,
  site,
  token,
  uploadOptions,
  htmlFolder,
  dependencies = defaultDependencies,
) {
  const { chalk: chalkDep } = dependencies;
  
  console.log(chalkDep.blue(`\nProcessing page: ${pagePath}`));

  // Extract page name from pagePath to create shadow folder
  const pageName = path.basename(pagePath, path.extname(pagePath));
  const shadowFolder = `.${pageName}`;

  // Calculate relative path from HTML folder to preserve folder structure
  const relativePath = path.relative(htmlFolder, path.dirname(pagePath));
  const fullShadowPath = relativePath ? path.join(relativePath, shadowFolder) : shadowFolder;

  // Extract URLs from the HTML
  const urls = extractUrlsFromHTML(htmlContent, dependencies);

  // Find URLs that match asset URLs (decode URLs and then match)
  const assetUrlsArray = Array.isArray(assetUrls) ? assetUrls : Array.from(assetUrls);
  const matchingAssetUrls = urls.filter(url => {
    try {
      const decodedUrl = decodeURIComponent(url);
      return assetUrlsArray.includes(decodedUrl) || assetUrlsArray.includes(url);
    } catch (error) {
      // If decoding fails, try matching the original URL
      return assetUrlsArray.includes(url);
    }
  });

  console.log(chalkDep.yellow(`Found ${matchingAssetUrls.length} asset references in the page.`));

  let uniqueAssets = 0;
  let copiedAssets = 0;
  let downloadedAssets = 0;

  if (matchingAssetUrls.length > 0) {
    let assetMapping;
    let assetsToDownload = [];
    
    // Check if we're using local assets first
    const localAssetsPath = uploadOptions.localAssetsPath;
    if (localAssetsPath) {
      console.log(chalkDep.yellow(`Attempting to resolve assets from local folder: ${localAssetsPath}`));
      const result = await copyLocalPageAssets(
        matchingAssetUrls,
        fullShadowPath,
        downloadFolder,
        localAssetsPath,
        dependencies,
      );
      assetMapping = result.assetMapping;
      copiedAssets = result.copyResults.filter(r => r.status === COPY_STATUS.SUCCESS).length;
      
      // Identify failed copies that need to be downloaded
      const failedUrls = [];
      result.copyResults.forEach((copyResult, index) => {
        if (copyResult.status === COPY_STATUS.ERROR) {
          failedUrls.push(matchingAssetUrls[index]);
        }
      });
      
      if (failedUrls.length > 0 && siteOrigin) {
        console.log(chalkDep.yellow(`Falling back to download ${failedUrls.length} asset(s) from remote source...`));
        assetsToDownload = failedUrls;
      } else if (failedUrls.length > 0 && !siteOrigin) {
        console.warn(chalkDep.yellow(`Warning: ${failedUrls.length} asset(s) not found locally and no siteOrigin provided for fallback download.`));
      }
    } else {
      // No local assets path provided, download all from remote
      assetsToDownload = matchingAssetUrls;
    }
    
    // Download any assets that weren't resolved locally
    if (assetsToDownload.length > 0) {
      const fullyQualifiedAssetUrls = getFullyQualifiedAssetUrls(assetsToDownload, siteOrigin);
      
      const result = await downloadPageAssets(
        fullyQualifiedAssetUrls, 
        fullShadowPath, 
        downloadFolder, 
        {
          maxRetries: uploadOptions.maxRetries,
          retryDelay: uploadOptions.retryDelay,
        },
        dependencies,
      );
      downloadedAssets = result.downloadResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED).length;
      
      // If we don't have an assetMapping yet, use the downloaded one
      // Otherwise, merge the mappings
      if (!assetMapping) {
        assetMapping = result.assetMapping;
      }
    }

    // Track unique assets (assetMapping is a Map with unique keys)
    uniqueAssets = assetMapping ? assetMapping.size : 0;

    // Upload assets to DA
    const daAdminUrl = buildDaAdminUrl(org, site);
    await uploadPageAssets(assetMapping, daAdminUrl, token, uploadOptions, downloadFolder, dependencies);
  } else {
    console.log(
      chalkDep.gray(`No asset references found for page ${pagePath}. Updating page references and uploading HTML as-is...`),
    );
  }

  // Update page references in the HTML content to point to their DA location
  const updatedHtmlContent = updatePageReferencesInHTML(htmlContent, matchingAssetUrls, siteOrigin, dependencies);

  // Update the asset references in the HTML content
  const finalHtmlContent = updateAssetReferencesInHTML(
    fullShadowPath, 
    updatedHtmlContent, 
    new Set(matchingAssetUrls), 
    org, 
    site, 
    dependencies, 
    uploadOptions,
  );

  // Get save location and save HTML
  const htmlPath = getSaveLocation(
    pagePath, 
    htmlFolder, 
    downloadFolder, 
    dependencies,
  );
  
  saveHtmlToDownloadFolder(finalHtmlContent, htmlPath, dependencies);

  // Upload HTML to DA
  const daAdminUrl = buildDaAdminUrl(org, site);
  await uploadHTMLPage(htmlPath, daAdminUrl, token, uploadOptions, dependencies);

  console.log(chalkDep.green(`Completed processing page: ${pagePath}`));
  
  return {
    assetReferences: matchingAssetUrls.length,
    uniqueAssets,
    copiedAssets,
    downloadedAssets,
  };
}

/**
 * Process other (non-HTML) files in the given DA folder
 * @param {string} daFolder - DA folder containing other files
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options including maxRetries and retryDelay
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array>} Array of upload results for non-HTML files
 */
async function processOtherFiles(daFolder, org, site, token, uploadOptions, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFolder: uploadFolderDep } = dependencies;
  
  console.log(chalkDep.blue('\nProcessing non-HTML files...'));
  
  const daAdminUrl = buildDaAdminUrl(org, site);
  
  // Use uploadFolder with exclude extensions to skip HTML files
  const result = await uploadFolderDep(daFolder, daAdminUrl, token, {
    ...uploadOptions,
    baseFolder: daFolder,
    excludeExtensions: ['.html', '.htm'],
    useBatching: false, // Use sequential upload for non-HTML files
  });
  
  // Return the results array from uploadFolder
  return result.results || [];
}

/**
 * Process multiple pages sequentially
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {Array<string>} assetUrls - Array of asset URLs to process
 * @param {string} siteOrigin - The site origin for resolving relative URLs
 * @param {string} daFolder - Path to the DA folder containing HTML pages
 * @param {string} downloadFolder - Path to download assets and store processed files
 * @param {string} token - Authentication token for DA
 * @param {boolean} keep - Whether to keep downloaded files after processing
 * @param {Object} uploadOptions - Options for upload (convertImagesToPng, maxRetries, etc.)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array>} Array of processing results including both HTML and non-HTML files
 */
export async function processPages(
  org,
  site,
  assetUrls,
  siteOrigin,
  daFolder,
  downloadFolder,
  token,
  keep = false,
  uploadOptions = {},
  dependencies = defaultDependencies,
) {
  const { fs: fsDep, chalk: chalkDep, getAllFiles: getAllFilesDep } = dependencies;

  console.log(chalkDep.blue(`Starting DA upload process for ${org}/${site}`));
  console.log(chalkDep.blue(`DA Admin URL: ${buildDaAdminUrl(org, site)}`));
  console.log(chalkDep.blue(`DA Content URL: ${buildDaContentUrl(org, site)}`));
  console.log(chalkDep.blue(`DA List URL: ${buildDaListUrl(org, site)}`));

  try {
    // Get all HTML files in the DA folder
    const allFiles = getAllFilesDep(daFolder);
    const htmlFiles = allFiles.filter(file => path.extname(file).toLowerCase() === '.html');

    const htmlResults = [];
    
    if (htmlFiles.length === 0) {
      console.log(chalkDep.yellow('No HTML files found in DA folder'));
    } else {
      console.log(chalkDep.blue(`Found ${htmlFiles.length} HTML files to process`));

      // Process each HTML file and collect results
      for (const htmlFile of htmlFiles) {
        try {
          const htmlContent = fsDep.readFileSync(htmlFile, UTF8_ENCODING);
          const processedStats = await processSinglePage(
            htmlFile, 
            htmlContent, 
            assetUrls, 
            siteOrigin, 
            downloadFolder, 
            org, 
            site, 
            token, 
            uploadOptions, 
            daFolder, 
            dependencies,
          );
          // Add success result for HTML file with asset information
          htmlResults.push({
            filePath: htmlFile,
            uploaded: true,
            assetStats: processedStats,
          });
        } catch (error) {
          console.error(chalkDep.red(`Error processing ${htmlFile}: `, error.message));
          // Add error result for HTML file
          htmlResults.push({
            filePath: htmlFile,
            error: error.message,
            uploaded: false,
            assetStats: { assetReferences: 0, uniqueAssets: 0, copiedAssets: 0, downloadedAssets: 0 },
          });
          throw error;
        }
      }

      console.log(chalkDep.green(`Successfully processed all ${htmlFiles.length} pages`));
    }

    // Process other (non-HTML) files
    const otherFilesResults = await processOtherFiles(daFolder, org, site, token, uploadOptions, dependencies);
    
    // Combine all results
    const allResults = [...htmlResults, ...otherFilesResults];
    
    // Summary
    const successfulPages = allResults.filter(result => {
      // Handle both HTML results (uploaded/error format) and upload results (success format)
      return result.success === true || (result.uploaded === true && !result.error);
    }).length;
    
    // Calculate detailed asset statistics
    const totals = htmlResults.reduce(
      (acc, { assetStats = {} }) => {
        acc.references += assetStats.assetReferences || 0;
        acc.unique += assetStats.uniqueAssets || 0;
        acc.copied += assetStats.copiedAssets || 0;
        acc.downloaded += assetStats.downloadedAssets || 0;
        return acc;
      },
      { references: 0, unique: 0, copied: 0, downloaded: 0 },
    );
    
    const { references: totalReferences, unique: totalUniqueAssets, copied: totalCopiedAssets, downloaded: totalDownloadedAssets } = totals;
    const totalFiles = htmlFiles.length + otherFilesResults.length;
    
    console.log(chalkDep.green('\nProcessing complete!'));
    console.log(chalkDep.green(`- Processed ${successfulPages}/${totalFiles} files successfully`));
    
    if (totalUniqueAssets > 0) {
      console.log(chalkDep.green(`- Processed ${totalUniqueAssets} unique asset(s) from ${totalReferences} reference(s)`));
      if (totalCopiedAssets > 0 || totalDownloadedAssets > 0) {
        const details = [];
        if (totalCopiedAssets > 0) details.push(`${totalCopiedAssets} copied from local`);
        if (totalDownloadedAssets > 0) details.push(`${totalDownloadedAssets} downloaded from remote`);
        console.log(chalkDep.green(`  (${details.join(', ')})`));
      }
    } else {
      console.log(chalkDep.green('- No assets to process'));
    }
    
    return allResults;

  } finally {
    // Clean up downloaded files if not keeping them
    if (!keep && fsDep.existsSync(downloadFolder)) {
      console.log(chalkDep.yellow('Cleaning up downloaded files...'));
      fsDep.rmSync(downloadFolder, { recursive: true, force: true });
      console.log(chalkDep.green('Cleanup completed'));
    }
  }
}
