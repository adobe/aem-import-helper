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
import { JSDOM } from 'jsdom';
import { downloadAssets } from '../utils/download-assets.js';
import chalk from 'chalk';
import { getAllHtmlFiles } from './upload.js';

// Default dependencies for production use
const defaultDependencies = {
  fs,
  path,
  JSDOM,
  downloadAssets,
  chalk,
  getAllHtmlFiles,
  uploadFolder: null, // Will be set below
};

// Import uploadFolder for default dependencies
import { uploadFolder } from './upload.js';
defaultDependencies.uploadFolder = uploadFolder;

/**
 * Get all HTML files from a folder recursively
 * @param {string} folderPath - The absolute path to the folder to scan
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of absolute file paths to HTML files
 */
export function getHTMLFiles(folderPath, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  const getAllFilesFn = dependencies.getAllHtmlFiles || getAllHtmlFiles;
  try {
    console.log(chalkDep.blue(`Scanning for HTML files in: ${folderPath}`));
    // Get all HTML files recursively
    let htmlFiles = getAllFilesFn(folderPath, { fileExtensions: ['.html', '.htm'] }, dependencies);
    console.log(chalkDep.blue(`Found ${htmlFiles.length} HTML files`));
    return htmlFiles;
  } catch (error) {
    console.error(chalkDep.red(`Error scanning HTML files: ${error.message}`));
    throw error;
  }
}

/**
 * Extract all href attributes from anchor tags and src attributes from img tags in an HTML string
 * @param {string} htmlContent - The HTML content to parse
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of href and src values found in the HTML
 */
function extractHrefsFromHTML(htmlContent, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;
  
  // Get all href attributes from anchor tags
  const links = document.querySelectorAll('a[href]');
  const hrefs = Array.from(links).map(link => link.getAttribute('href'));
  
  // Get all src attributes from img tags
  const images = document.querySelectorAll('img[src]');
  const srcs = Array.from(images).map(img => img.getAttribute('src'));
  
  // Combine both arrays
  return [...hrefs, ...srcs];
}

/**
 * Check if a URL is present in the asset URLs list
 * @param {string} href - The href to check
 * @param {Set<string>} assetUrls - Set of asset URLs to match against
 * @return {boolean} True if the href is found in assetUrls
 */
function isAssetUrl(href, assetUrls) {
  return assetUrls.has(href);
}

/**
 * Update href attributes in anchor tags and src attributes in img tags in HTML to point to DA environment
 * @param {string} pagePath - The path to the HTML page to create shadow folder structure
 * @param {string} htmlContent - The HTML content to update
 * @param {Set<string>} assetUrls - Set of asset URLs that should be updated
 * @param {string} daLocation - The DA location URL to replace the hostname with
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} Updated HTML content with modified hrefs and srcs
 */
function updateHrefsInHTML(pagePath, htmlContent, assetUrls, daLocation, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep, path: pathDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;
  
  // Extract page name from pagePath to create shadow folder
  const pageName = pathDep.basename(pagePath, pathDep.extname(pagePath));
  const shadowFolder = `.${pageName}`;
  
  // Helper to extract clean filename (no query params or fragments)
  const getFilename = (url) => {
    try {
      // Handle absolute URLs - pathname excludes query params and fragments
      return new URL(url).pathname.split('/').pop();
    } catch {
      // Handle relative paths - manually strip query params and fragments
      return url.split('?')[0].split('#')[0].split('/').pop();
    }
  };
  ['a[href]', 'img[src]'].forEach(selector => {
    const attribute = selector.includes('href') ? 'href' : 'src';
    
    document.querySelectorAll(selector).forEach(element => {
      const url = element.getAttribute(attribute);
      if (assetUrls.has(url)) {
        const filename = getFilename(url);
        element.setAttribute(attribute, `${daLocation}/${shadowFolder}/${filename}`);
      }
    });
  });
  
  return dom.serialize();
}

// Export updateHrefsInHTML for testing
export { updateHrefsInHTML };

/**
 * Create a mapping for asset urls and their storage location.
 * @param {Array<string>} matchingHrefs - Array of matching asset URLs
 * @param {string} fullShadowPath - The full shadow folder path
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Map<string, string>} Asset mapping for download
 */
export function createAssetMapping(matchingHrefs, fullShadowPath) {
  const getFilename = (url) => {
    try {
      return new URL(url).pathname.split('/').pop();
    } catch {
      return url.split('?')[0].split('#')[0].split('/').pop();
    }
  };

  return new Map(
    matchingHrefs.map(url => [url, `/${fullShadowPath}/${getFilename(url)}`]),
  );
}

/**
 * Download assets for a page to the shadow folder
 * @param {Array<string>} matchingHrefs - Array of matching asset URLs
 * @param {string} fullShadowPath - The full shadow folder path
 * @param {string} downloadFolder - Base download folder
 * @param {number} maxRetries - Maximum retries for download
 * @param {number} retryDelay - Delay between retries
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array>} Download results
 */
async function downloadPageAssets(matchingHrefs, fullShadowPath, downloadFolder, maxRetries, retryDelay, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  
  const simplifiedAssetMapping = createSimplifiedAssetMapping(matchingHrefs, fullShadowPath, dependencies);
  
  console.log(chalkDep.blue(`Downloading ${matchingHrefs.length} assets for this page...`));
  const downloadResults = await dependencies.downloadAssets(simplifiedAssetMapping, downloadFolder, maxRetries, retryDelay);
  
  // Count successful downloads
  const successfulDownloads = downloadResults.filter(result => result.status === 'fulfilled').length;
  const failedDownloads = downloadResults.filter(result => result.status === 'rejected').length;
  
  console.log(chalkDep.green(`Successfully downloaded ${successfulDownloads} assets`));
  if (failedDownloads > 0) {
    console.log(chalkDep.red(`Failed to download ${failedDownloads} assets`));
  }
  
  return downloadResults;
}

/**
 * Upload assets for a page to DA
 * @param {string} shadowFolderPath - Path to the shadow folder containing assets
 * @param {string} daLocation - DA location URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} downloadFolder - Base download folder for relative path calculation
 * @param {number} pageIndex - Page index for logging
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadPageAssets(shadowFolderPath, daLocation, token, uploadOptions, downloadFolder, pageIndex, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFolder: uploadFolderDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading assets for page ${pageIndex} to ${shadowFolderPath}...`));
  try {
    await uploadFolderDep(shadowFolderPath, daLocation, token, {
      ...uploadOptions,
      baseFolder: downloadFolder, // preserve shadow folder structure
    });
    console.log(chalkDep.green(`Successfully uploaded assets for page ${pageIndex} to ${shadowFolderPath}`));
  } catch (uploadError) {
    console.error(chalkDep.red(`Error uploading assets for page ${pageIndex}:`, uploadError.message));
    throw uploadError;
  }
}

/**
 * Upload an HTML page to DA
 * @param {string} pageDir - Directory containing the HTML page
 * @param {string} daLocation - DA location URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} htmlFolder - Base HTML folder for relative path calculation
 * @param {number} pageIndex - Page index for logging
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadHTMLPage(pageDir, daLocation, token, uploadOptions, htmlFolder, pageIndex, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFolder: uploadFolderDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading updated HTML page ${pageIndex}...`));
  try {
    await uploadFolderDep(pageDir, daLocation, token, {
      ...uploadOptions,
      baseFolder: htmlFolder,
    });
    console.log(chalkDep.green(`Successfully uploaded HTML page ${pageIndex}`));
  } catch (uploadError) {
    console.error(chalkDep.red(`Error uploading HTML page ${pageIndex}:`, uploadError.message));
    throw uploadError;
  }
}

/**
 * Clean up downloaded assets for a page to free disk space
 * @param {string} shadowFolderPath - Path to the shadow folder to clean up
 * @param {number} pageIndex - Page index for logging
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @param {Function} callback - The callback function to execute after cleanup
 */
function cleanupPageAssets(shadowFolderPath, dependencies, callback) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  fsDep.rm(shadowFolderPath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.warn(chalkDep.yellow(`Warning: Could not clean up folder ${shadowFolderPath}:`, err));
    }
    if (callback) {
      callback();
    }
  });
}

/**
 * Process a single HTML page with assets
 * @param {string} pagePath - Path to the HTML page
 * @param {string} htmlFolder - Base HTML folder
 * @param {string} downloadFolder - Base download folder
 * @param {Set<string>} assetUrls - Set of asset URLs to match
 * @param {string} daLocation - DA location URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {number} maxRetries - Maximum retries for download
 * @param {number} retryDelay - Delay between retries
 * @param {number} pageIndex - Page index for logging
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Processing result for the page
 */
async function processSinglePage(pagePath, htmlFolder, downloadFolder, assetUrls, daLocation, token, uploadOptions, maxRetries, retryDelay, pageIndex, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep, path: pathDep } = dependencies;
  
  console.log(chalkDep.blue(`\nProcessing page ${pageIndex}: ${pagePath}`));
  
  try {
    // Read the HTML file
    const htmlContent = fsDep.readFileSync(pagePath, 'utf-8');
    
    // Extract hrefs from the HTML
    const hrefs = extractHrefsFromHTML(htmlContent, dependencies);
    
    // Find hrefs that match asset URLs
    const matchingHrefs = hrefs.filter(href => isAssetUrl(href, assetUrls));
    console.log(chalkDep.yellow(`Found ${matchingHrefs.length} asset references.`));
    
    if (matchingHrefs.length > 0) {
      // Extract page name from pagePath to create shadow folder
      const pageName = pathDep.basename(pagePath, pathDep.extname(pagePath));
      const shadowFolder = `.${pageName}`;
      
      // Calculate relative path from HTML folder to preserve folder structure
      const relativePath = pathDep.relative(htmlFolder, pathDep.dirname(pagePath));
      const fullShadowPath = relativePath ? pathDep.join(relativePath, shadowFolder) : shadowFolder;
      const shadowFolderPath = pathDep.join(downloadFolder, fullShadowPath);
      
      // Create shadow folder structure
      if (!fsDep.existsSync(shadowFolderPath)) {
        fsDep.mkdirSync(shadowFolderPath, { recursive: true });
      }
      
      // Download assets for this page
      const downloadResults = await downloadPageAssets(matchingHrefs, fullShadowPath, downloadFolder, maxRetries, retryDelay, dependencies);
      
      // Upload assets for this page immediately
      await uploadPageAssets(shadowFolderPath, daLocation, token, uploadOptions, downloadFolder, pageIndex, dependencies);
      
      // Update the HTML content
      const updatedContent = updateHrefsInHTML(pagePath, htmlContent, new Set(matchingHrefs), daLocation, dependencies);
      
      // Save updated HTML content
      fsDep.writeFileSync(pagePath, updatedContent, 'utf-8');
      console.log(chalkDep.green(`Updated and saved page: ${pagePath}`));
      
      // Upload the updated HTML page
      await uploadHTMLPage(pathDep.dirname(pagePath), daLocation, token, uploadOptions, htmlFolder, pageIndex, dependencies);
      
      // Clean up downloaded assets for this page to free disk space
      cleanupPageAssets(shadowFolderPath, dependencies, () => {
      });
      
      return {
        filePath: pagePath,
        updatedContent,
        downloadedAssets: matchingHrefs,
        downloadResults,
        uploaded: true,
      };
      
    } else {
      // No matching assets found, just upload the HTML page as-is
      console.log(chalkDep.gray(`No asset references found for page ${pageIndex}, uploading HTML as-is...`));
      try {
        await uploadHTMLPage(pathDep.dirname(pagePath), daLocation, token, uploadOptions, htmlFolder, pageIndex, dependencies);
      } catch (uploadError) {
        console.error(chalkDep.red(`Error uploading HTML page ${pageIndex}:`, uploadError.message));
      }
      
      return {
        filePath: pagePath,
        updatedContent: htmlContent,
        downloadedAssets: [],
        downloadResults: [],
        uploaded: true,
      };
    }
    
  } catch (error) {
    console.error(chalkDep.red(`Error processing page ${pageIndex} ${pagePath}:`, error.message));
    return {
      filePath: pagePath,
      error: error.message,
      downloadedAssets: [],
      downloadResults: [],
      uploaded: false,
    };
  }
}

/**
 * Process HTML pages one by one, downloading and uploading assets for each page immediately
 * This prevents disk space issues with large files
 * @param {string} daLocation - The DA location URL
 * @param {Set<string>} assetUrls - Set of asset URLs to match and download
 * @param {string} htmlFolder - Folder containing HTML files
 * @param {string} downloadFolder - Folder to download assets to (temporary)
 * @param {string} token - DA authentication token
 * @param {Object} uploadOptions - Options for upload operations
 * @param {number} maxRetries - Maximum number of retries for downloading
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<{filePath: string, updatedContent: string, downloadedAssets: Array<string>}>>} 
 *         Promise that resolves with array of processed page results
 */
export async function processPages(daLocation, assetUrls, htmlFolder, downloadFolder, token, uploadOptions = {}, maxRetries = 3, retryDelay = 5000, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  const getHTMLFilesFn = dependencies.getAllHtmlFiles || getHTMLFiles;
  const htmlPages = getHTMLFilesFn(htmlFolder, { fileExtensions: ['.html', '.htm'] }, dependencies);
  const results = [];
  
  console.log(chalkDep.blue(`Processing ${htmlPages.length} HTML pages sequentially...`));
  
  // Ensure download folder exists
  if (!fsDep.existsSync(downloadFolder)) {
    fsDep.mkdirSync(downloadFolder, { recursive: true });
  }
  
  // Process each page individually
  for (let i = 0; i < htmlPages.length; i++) {
    const pagePath = htmlPages[i];
    const pageIndex = i + 1;
    
    const result = await processSinglePage(
      pagePath,
      htmlFolder,
      downloadFolder,
      assetUrls,
      daLocation,
      token,
      uploadOptions,
      maxRetries,
      retryDelay,
      pageIndex,
      dependencies,
    );
    
    results.push(result);
  }
  
  // Summary
  const successfulPages = results.filter(page => !page.error).length;
  const totalAssets = results.reduce((sum, page) => sum + page.downloadedAssets.length, 0);
  
  console.log(chalkDep.green('\nProcessing complete!'));
  console.log(chalkDep.green(`- Processed ${successfulPages}/${htmlPages.length} pages successfully`));
  console.log(chalkDep.green(`- Downloaded and uploaded ${totalAssets} assets`));
  
  return results;
}