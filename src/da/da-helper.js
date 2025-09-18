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
import { getAllFiles } from './upload.js';

// Import functions from modular components
import {
  buildDaAdminUrl,
  buildDaContentUrl,
  buildDaListUrl,
  getFullyQualifiedAssetUrls,
} from './url-utils.js';

import {
  downloadPageAssets,
  uploadPageAssets,
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
 * @return {Promise<void>}
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

  if (matchingAssetUrls.length > 0) {
    // Get fully qualified asset URLs to download from the source
    const fullyQualifiedAssetUrls = getFullyQualifiedAssetUrls(matchingAssetUrls, siteOrigin);

    // Download and upload assets for this page
    const { assetMapping } = await downloadPageAssets(
      fullyQualifiedAssetUrls, 
      fullShadowPath, 
      downloadFolder, 
      {
        maxRetries: uploadOptions.maxRetries || 3,
        retryDelay: uploadOptions.retryDelay || 1000,
      },
      dependencies,
    );

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
 * @return {Promise<void>}
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

    if (htmlFiles.length === 0) {
      console.log(chalkDep.yellow('No HTML files found in DA folder'));
      return;
    }

    console.log(chalkDep.blue(`Found ${htmlFiles.length} HTML files to process`));

    // Process each HTML file
    for (const htmlFile of htmlFiles) {
      try {
        const htmlContent = fsDep.readFileSync(htmlFile, UTF8_ENCODING);
        await processSinglePage(
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
      } catch (error) {
        console.error(chalkDep.red(`Error processing ${htmlFile}:`, error.message));
        throw error;
      }
    }

    console.log(chalkDep.green(`Successfully processed all ${htmlFiles.length} pages`));

  } finally {
    // Clean up downloaded files if not keeping them
    if (!keep && fsDep.existsSync(downloadFolder)) {
      console.log(chalkDep.yellow('Cleaning up downloaded files...'));
      fsDep.rmSync(downloadFolder, { recursive: true, force: true });
      console.log(chalkDep.green('Cleanup completed'));
    }
  }
}