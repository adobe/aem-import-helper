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
import { JSDOM } from 'jsdom';
import { downloadAssets } from '../utils/download-assets.js';
import chalk from 'chalk';

// Default dependencies for production use
const defaultDependencies = {
  fs,
  path,
  JSDOM,
  downloadAssets,
  chalk,
};

/**
 * Recursively get all files from a directory
 * @param {string} dirPath - The directory path to scan
 * @param {Array<string>} fileExtensions - Optional array of file extensions to filter (e.g., ['.html', '.css'])
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of absolute file paths
 */
export function getAllFiles(dirPath, fileExtensions = [], dependencies = defaultDependencies) {
  const { fs: fsDep, path: pathDep } = dependencies;
  const files = [];
  
  function scanDirectory(currentPath) {
    const items = fsDep.readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = pathDep.join(currentPath, item);
      const stat = fsDep.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile()) {
        // Filter by file extension if specified
        if (fileExtensions.length === 0 || fileExtensions.includes(pathDep.extname(fullPath))) {
          files.push(fullPath);
        }
      }
    }
  }
  
  scanDirectory(dirPath);
  return files;
}

/**
 * Get all HTML files from a folder recursively
 * @param {string} folderPath - The absolute path to the folder to scan
 * @param {Array<string>} excludePatterns - Array of patterns to exclude (e.g., ['node_modules', '.git'])
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of absolute file paths to HTML files
 */
export function getHTMLFiles(folderPath, excludePatterns = [], dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  
  try {
    // Validate folder exists
    if (!fsDep.existsSync(folderPath)) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    const stat = fsDep.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }

    console.log(chalkDep.blue(`Scanning for HTML files in: ${folderPath}`));
    
    // Get all HTML files recursively
    let htmlFiles = getAllFiles(folderPath, ['.html', '.htm'], dependencies);
    
    // Apply exclude patterns
    if (excludePatterns.length > 0) {
      htmlFiles = htmlFiles.filter(filePath => {
        return !excludePatterns.some(pattern => {
          return filePath.includes(pattern);
        });
      });
    }

    console.log(chalkDep.blue(`Found ${htmlFiles.length} HTML files`));
    
    if (htmlFiles.length > 0) {
      htmlFiles.forEach(file => {
        console.log(chalkDep.gray(`  - ${file}`));
      });
    }

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
 * @param {Array<string>} assetUrls - List of asset URLs to match against
 * @return {boolean} True if the href is found in assetUrls
 */
function isAssetUrl(href, assetUrls) {
  return assetUrls.includes(href);
}

/**
 * Update href attributes in anchor tags and src attributes in img tags in HTML to point to DA environment
 * @param {string} pagePath - The path to the HTML page to create shadow folder structure
 * @param {string} htmlContent - The HTML content to update
 * @param {Array<string>} assetUrls - List of asset URLs that should be updated
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
  
  // Update href attributes in anchor tags
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (isAssetUrl(href, assetUrls)) {
      try {
        // Parse the URL to get the filename
        const urlObj = new URL(href);
        const filename = urlObj.pathname.split('/').pop();
        // Replace the hostname with DA location and place in shadow folder
        const newHref = `${daLocation}/${shadowFolder}/${filename}`;
        link.setAttribute('href', newHref);
      } catch (error) {
        // If URL parsing fails, assume it's already a relative path
        const filename = href.split('/').pop();
        const newHref = `${daLocation}/${shadowFolder}/${filename}`;
        link.setAttribute('href', newHref);
      }
    }
  });
  
  // Update src attributes in img tags
  const images = document.querySelectorAll('img[src]');
  images.forEach(img => {
    const src = img.getAttribute('src');
    if (isAssetUrl(src, assetUrls)) {
      try {
        // Parse the URL to get the filename
        const urlObj = new URL(src);
        const filename = urlObj.pathname.split('/').pop();
        // Replace the hostname with DA location and place in shadow folder
        const newSrc = `${daLocation}/${shadowFolder}/${filename}`;
        img.setAttribute('src', newSrc);
      } catch (error) {
        // If URL parsing fails, assume it's already a relative path
        const filename = src.split('/').pop();
        const newSrc = `${daLocation}/${shadowFolder}/${filename}`;
        img.setAttribute('src', newSrc);
      }
    }
  });
  
  return dom.serialize();
}

/**
 * Convert a list of asset URLs to an asset mapping where the key is the URL and value is the relative path
 * @param {Array<string>} assetUrls - Array of asset URLs
 * @param {string} pagePath - The path to the HTML page to create shadow folder structure
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Map<string, string>} Map where key is the asset URL and value is the relative path
 */
export function convertAssetUrlsToMapping(assetUrls, pagePath = '', dependencies = defaultDependencies) {
  const { path: pathDep } = dependencies;
  const assetMapping = new Map();
  
  // Extract page name from pagePath to create shadow folder
  const pageName = pagePath ? pathDep.basename(pagePath, pathDep.extname(pagePath)) : '';
  const shadowFolder = pageName ? `.${pageName}` : '';
  
  assetUrls.forEach(url => {
    try {
      // Parse the URL to extract the filename
      const urlObj = new URL(url);
      const filename = urlObj.pathname.split('/').pop();
      const relativePath = shadowFolder ? `/${shadowFolder}/${filename}` : `/${filename}`;
      assetMapping.set(url, relativePath);
    } catch (error) {
      // If URL parsing fails, assume it's already a relative path
      const filename = url.split('/').pop();
      const relativePath = shadowFolder ? `/${shadowFolder}/${filename}` : `/${filename}`;
      assetMapping.set(url, relativePath);
    }
  });
  
  return assetMapping;
}

/**
 * Process HTML pages and download matching assets
 * @param {string} daLocation - The DA location URL
 * @param {Array<string>} htmlPages - Array of file paths to HTML pages
 * @param {Array<string>} assetUrls - Array of asset URLs to match and download
 * @param {string} downloadFolder - Folder to download assets to
 * @param {number} maxRetries - Maximum number of retries for downloading an asset
 * @param {number} retryDelay - The delay between retries in milliseconds
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<{filePath: string, updatedContent: string, downloadedAssets: Array<string>}>>} 
 *         Promise that resolves with array of processed page results
 */
export async function processHTMLPages(daLocation, htmlPages, assetUrls, downloadFolder, maxRetries = 3, retryDelay = 5000, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  const results = [];
  
  for (const pagePath of htmlPages) {
    try {
      console.log(chalkDep.blue(`Processing page: ${pagePath}`));
      
      // Read the HTML file
      const htmlContent = fsDep.readFileSync(pagePath, 'utf-8');
      
      // Extract hrefs from the HTML
      const hrefs = extractHrefsFromHTML(htmlContent, dependencies);
      console.log(chalkDep.gray(`Found ${hrefs.length} hrefs in ${pagePath}`));
      
      // Find hrefs that match asset URLs
      const matchingHrefs = hrefs.filter(href => isAssetUrl(href, assetUrls));
      console.log(chalkDep.yellow(`Found ${matchingHrefs.length} matching asset URLs`));
      
      if (matchingHrefs.length > 0) {
        // Convert asset URLs to mapping with relative paths
        const assetMapping = convertAssetUrlsToMapping(matchingHrefs, pagePath, dependencies);
        
        // Download the assets
        console.log(chalkDep.blue(`Downloading ${matchingHrefs.length} assets...`));
        const downloadResults = await dependencies.downloadAssets(assetMapping, downloadFolder, maxRetries, retryDelay);
        
        // Count successful downloads
        const successfulDownloads = downloadResults.filter(result => result.status === 'fulfilled').length;
        const failedDownloads = downloadResults.filter(result => result.status === 'rejected').length;
        
        console.log(chalkDep.green(`Successfully downloaded ${successfulDownloads} assets`));
        if (failedDownloads > 0) {
          console.log(chalkDep.red(`Failed to download ${failedDownloads} assets`));
        }
        
        // Update the HTML content
        const updatedContent = updateHrefsInHTML(pagePath, htmlContent, matchingHrefs, daLocation, dependencies);
        
        results.push({
          filePath: pagePath,
          updatedContent,
          downloadedAssets: matchingHrefs,
          downloadResults,
        });
      } else {
        // No matching assets found, return original content
        results.push({
          filePath: pagePath,
          updatedContent: htmlContent,
          downloadedAssets: [],
          downloadResults: [],
        });
      }
      
    } catch (error) {
      console.error(chalkDep.red(`Error processing page ${pagePath}:`, error.message));
      results.push({
        filePath: pagePath,
        error: error.message,
        downloadedAssets: [],
        downloadResults: [],
      });
    }
  }
  
  return results;
}

/**
 * Save updated HTML content back to files
 * @param {Array<{filePath: string, updatedContent: string}>} processedPages - Array of processed page results
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>} Promise that resolves when all files are saved
 */
export async function saveUpdatedPages(processedPages, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  
  for (const page of processedPages) {
    if (page.error) {
      console.log(chalkDep.red(`Skipping ${page.filePath} due to error: ${page.error}`));
      continue;
    }
    
    try {
      // Save the updated content back to the original file
      fsDep.writeFileSync(page.filePath, page.updatedContent, 'utf-8');
      console.log(chalkDep.green(`Updated page: ${page.filePath}`));
      
    } catch (error) {
      console.error(chalkDep.red(`Error saving updated page ${page.filePath}:`, error.message));
    }
  }
}

/**
 * Main function to process HTML pages and download assets
 * @param {string} daLocation - The DA location URL
 * @param {Array<string>} assetUrls - Array of asset URLs to match and download
 * @param {string} htmlFolder - Folder containing HTML files
 * @param {string} downloadFolder - Folder to download assets to
 * @param {number} maxRetries - Maximum number of retries for downloading
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<{filePath: string, updatedContent: string, downloadedAssets: Array<string>}>>} 
 *         Promise that resolves with array of processed page results
 */
export async function processAndUpdateHTMLPages(daLocation, assetUrls, htmlFolder, downloadFolder, maxRetries = 3, retryDelay = 5000, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  const htmlPages = getHTMLFiles(htmlFolder, [], dependencies);
  console.log(chalkDep.blue(`Starting to process ${htmlPages.length} HTML pages...`));
  console.log(chalkDep.blue(`Looking for ${assetUrls.length} asset URLs`));
  
  // Process the pages
  const processedPages = await processHTMLPages(daLocation, htmlPages, assetUrls, downloadFolder, maxRetries, retryDelay, dependencies);
  
  // Save updated pages back to original files
  await saveUpdatedPages(processedPages, dependencies);
  
  // Summary
  const totalAssets = processedPages.reduce((sum, page) => sum + page.downloadedAssets.length, 0);
  const successfulPages = processedPages.filter(page => !page.error).length;
  
  console.log(chalkDep.green('\nProcessing complete!'));
  console.log(chalkDep.green(`- Processed ${successfulPages}/${htmlPages.length} pages successfully`));
  console.log(chalkDep.green(`- Downloaded ${totalAssets} assets`));
  
  return processedPages;
}

/**
 * Process all HTML files in a folder and download matching assets
 * @param {string} folderPath - The absolute path to the folder containing HTML files
 * @param {Array<string>} assetUrls - Array of asset URLs to match and download
 * @param {string} downloadFolder - Folder to download assets to
 * @param {Object} options - Additional options
 * @param {Array<string>} options.excludePatterns - Array of patterns to exclude from HTML file scanning
 * @param {number} options.maxRetries - Maximum number of retries for downloading an asset
 * @param {number} options.retryDelay - The delay between retries in milliseconds
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<{filePath: string, updatedContent: string, downloadedAssets: Array<string>}>>} 
 *         Promise that resolves with array of processed page results
 */
export async function processHTMLFolder(folderPath, assetUrls, downloadFolder, options = {}, dependencies = defaultDependencies) {
  const {
    excludePatterns = [],
    maxRetries = 3,
    retryDelay = 5000,
  } = options;

  const { chalk: chalkDep } = dependencies;

  console.log(chalkDep.blue(`\nProcessing HTML folder: ${folderPath}`));
  
  // Get all HTML files from the folder
  const htmlFiles = getHTMLFiles(folderPath, excludePatterns, dependencies);
  
  if (htmlFiles.length === 0) {
    console.log(chalkDep.yellow('No HTML files found to process'));
    return [];
  }
  
  // Process the HTML files
  return await processAndUpdateHTMLPages(htmlFiles, assetUrls, downloadFolder, maxRetries, retryDelay, dependencies);
}

export { updateHrefsInHTML };
