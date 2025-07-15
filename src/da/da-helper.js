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
import { getAllFiles, uploadFolder, uploadFile } from './upload.js';

// File encoding constant
const UTF8_ENCODING = 'utf-8';

const defaultDependencies = {
  fs,
  path,
  JSDOM,
  downloadAssets,
  chalk,
  getAllFiles,
  uploadFolder,
  uploadFile,
};

/**
 * Extract clean filename from URL (no query params or fragments)
 * @param {string} url - The URL to extract filename from
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} The filename extracted from the URL
 */
function getFilename(url, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  if (!url.startsWith('http')) {
    console.warn(chalkDep.yellow(`Warning: Relative path found: ${url}`));
  }
  const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, 'http://localhost');
  return urlObj.pathname.split('/').pop();
}

/**
 * Extract all URL attributes from anchor tags and img tags in an HTML string, returning an array of URLs.
 * @param {string} htmlContent - The HTML content to parse
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of URLs found in the HTML
 */
function extractUrlsFromHTML(htmlContent, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;
  
  // Get all href attributes from anchor tags
  const links = document.querySelectorAll('a[href]');
  const linkUrls = Array.from(links).map(link => link.getAttribute('href'));
  
  // Get all src attributes from img tags
  const images = document.querySelectorAll('img[src]');
  const imageUrls = Array.from(images).map(img => img.getAttribute('src'));
  
  // Combine both arrays
  return [...linkUrls, ...imageUrls];
}

/**
 * Update href attributes in anchor tags and src attributes in img tags in HTML to point to Author Bus.
 * @param {string} pagePath - The path to the HTML page to create shadow folder structure
 * @param {string} htmlContent - The HTML content to update
 * @param {Set<string>} assetUrls - Set of asset URLs that should be updated
 * @param {string} daLocation - The DA location URL to replace the hostname with
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} Updated HTML content with modified hrefs and srcs
 */
function updateImagesInHTML(pagePath, htmlContent, assetUrls, daLocation, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep, path: pathDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;
  
  // Extract page name from pagePath to create shadow folder
  const pageName = pathDep.basename(pagePath, pathDep.extname(pagePath));
  const shadowFolder = `.${pageName}`;
  
  // Map of CSS selectors to their corresponding attribute names
  const selectorAttrMap = new Map([
    ['a[href]', 'href'],
    ['img[src]', 'src'],
    // Add more pairs as needed
  ]);
  
  selectorAttrMap.forEach((attribute, selector) => {
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

/**
 * Create a mapping for asset urls and their storage location.
 * @param {Array<string>} matchingHrefs - Array of matching asset URLs
 * @param {string} fullShadowPath - The full shadow folder path
 * @return {Map<string, string>} Asset mapping for download
 */
export function createAssetMapping(matchingHrefs, fullShadowPath, dependencies = defaultDependencies) {
  return new Map(
    matchingHrefs.map(url => [url, `/${fullShadowPath}/${getFilename(url, dependencies)}`]),
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
  
  const simplifiedAssetMapping = createAssetMapping(matchingHrefs, fullShadowPath, dependencies);
  
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
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadPageAssets(shadowFolderPath, daLocation, token, uploadOptions, downloadFolder, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFolder: uploadFolderDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading assets for page to ${shadowFolderPath}...`));
  try {
    await uploadFolderDep(shadowFolderPath, daLocation, token, {
      ...uploadOptions,
      baseFolder: downloadFolder, // preserve shadow folder structure
    });
    console.log(chalkDep.green(`Successfully uploaded assets for page to ${shadowFolderPath}`));
  } catch (uploadError) {
    console.error(chalkDep.red('Error uploading assets for page', uploadError.message));
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
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadHTMLPage(pagePath, daLocation, token, uploadOptions, htmlFolder, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFile: uploadFileDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading updated HTML page: ${pagePath}...`));
  try {
    await uploadFileDep(pagePath, daLocation, token, {
      ...uploadOptions,
      baseFolder: htmlFolder,
    });
    console.log(chalkDep.green(`Successfully uploaded HTML page: ${pagePath}`));
  } catch (uploadError) {
    console.error(chalkDep.red(`Error uploading HTML page: ${pagePath}:`, uploadError.message));
    throw uploadError;
  }
}

/**
 * Clean up downloaded assets for a page to free disk space
 * @param {string} shadowFolderPath - Path to the shadow folder to clean up
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @param {Function} callback - The callback function to execute after cleanup
 */
function cleanupPageAssets(shadowFolderPath, dependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  fsDep.rm(shadowFolderPath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.warn(chalkDep.yellow(`Warning: Could not clean up folder ${shadowFolderPath}:`, err));
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
 * @param {Object} uploadOptions - Upload options including maxRetries and retryDelay
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Processing result for the page
 */
async function processSinglePage(pagePath, htmlFolder, downloadFolder, assetUrls, daLocation,
  token, uploadOptions, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep, path: pathDep } = dependencies;
  const { maxRetries = 3, retryDelay = 5000 } = uploadOptions;
  
  console.log(chalkDep.blue(`\nProcessing page: ${pagePath}`));
  
  try {
    // Read the HTML file
    const htmlContent = fsDep.readFileSync(pagePath, UTF8_ENCODING);
    
    // Extract URLs from the HTML
    const urls = extractUrlsFromHTML(htmlContent, dependencies);
    
    // Find URLs that match asset URLs
    const matchingUrls = urls.filter(url => assetUrls.has(url));
    console.log(chalkDep.yellow(`Found ${matchingUrls.length} asset references.`));
    
    if (matchingUrls.length > 0) {
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
      const downloadResults = await downloadPageAssets(matchingUrls, fullShadowPath, downloadFolder, maxRetries, retryDelay, dependencies);
      
      // Upload assets for this page immediately
      await uploadPageAssets(shadowFolderPath, daLocation, token, uploadOptions, downloadFolder, dependencies);
      
      // Update the HTML content
      const updatedContent = updateImagesInHTML(pagePath, htmlContent, new Set(matchingUrls), daLocation, dependencies);
      
      // Save updated HTML content
      fsDep.writeFileSync(pagePath, updatedContent, UTF8_ENCODING);
      console.log(chalkDep.green(`Updated and saved page: ${pagePath}`));
      
      // Upload the updated HTML page
      await uploadHTMLPage(pagePath, daLocation, token, uploadOptions, htmlFolder, dependencies);
      
      // Clean up downloaded assets for this page to free disk space
      cleanupPageAssets(shadowFolderPath, dependencies, () => {
      });
      
      return {
        filePath: pagePath,
        updatedContent,
        downloadedAssets: matchingUrls,
        downloadResults,
        uploaded: true,
      };
      
    } else {
      // No matching assets found, just upload the HTML page as-is
      console.log(chalkDep.gray(`No asset references found for page ${pagePath}, uploading HTML as-is...`));
      try {
        await uploadHTMLPage(pagePath, daLocation, token, uploadOptions, htmlFolder, dependencies);
      } catch (uploadError) {
        console.error(chalkDep.red(`Error uploading HTML page ${pagePath}:`, uploadError.message));
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
    console.error(chalkDep.red(`Error processing page ${pagePath}:`, error.message));
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
 * @param {number} uploadOptions.maxRetries - Maximum number of retry attempts for upload operations (default: 3)
 * @param {number} uploadOptions.retryDelay - Delay in milliseconds between retry attempts (default: 5000)
 * @param {string} uploadOptions.userAgent - Custom User-Agent header for HTTP requests (default: 'aem-import-helper/1.0')
 * @param {string} uploadOptions.baseFolder - Base folder path to calculate relative paths from
 * @param {Array<string>} uploadOptions.fileExtensions - Array of file extensions to include (e.g., ['.html', '.htm'])
 * @param {boolean} uploadOptions.withCredentials - Whether to include credentials in requests (default: true)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @param {Object} dependencies.fs - Node.js file system module
 * @param {Object} dependencies.path - Node.js path module
 * @param {Object} dependencies.JSDOM - JSDOM library for HTML parsing
 * @param {Object} dependencies.chalk - Chalk library for colored console output
 * @param {Function} dependencies.fetch - Fetch function for HTTP requests
 * @param {Object} dependencies.FormData - FormData constructor for multipart uploads
 * @param {Function} dependencies.downloadAssets - Function to download assets from URLs
 * @param {Function} dependencies.getAllFiles - Function to recursively get all files from a directory
 * @param {Function} dependencies.uploadFolder - Function to upload a folder to DA
 * @param {Function} dependencies.uploadFile - Function to upload a single file to DA
 * @return {Promise<Array<{filePath: string, updatedContent: string, downloadedAssets: Array<string>}>>} 
 *         Promise that resolves with array of processed page results
 */
export async function processPages(daLocation, assetUrls, htmlFolder, downloadFolder, token, uploadOptions = {}, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  const getHTMLFilesFn = dependencies.getAllFiles || getAllFiles;
  const htmlPages = getHTMLFilesFn(htmlFolder, ['.html', '.htm'], dependencies);
  const results = [];
  
  console.log(chalkDep.blue(`Processing ${htmlPages.length} HTML pages sequentially...`));
  
  // Ensure download folder exists
  if (!fsDep.existsSync(downloadFolder)) {
    fsDep.mkdirSync(downloadFolder, { recursive: true });
  }
  
  // Process each page individually
  for (let i = 0; i < htmlPages.length; i++) {
    const pagePath = htmlPages[i];
    
    const result = await processSinglePage(
      pagePath,
      htmlFolder,
      downloadFolder,
      assetUrls,
      daLocation,
      token,
      uploadOptions,
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