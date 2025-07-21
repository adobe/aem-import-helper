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
const LOCALHOST_URL = 'http://localhost';

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
  const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
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
 * Update asset references (href attributes in anchor tags and src attributes in img tags) in HTML to point to Author Bus.
 * @param {string} fullShadowPath - The path to the HTML page to create shadow folder structure
 * @param {string} htmlContent - The HTML content to update
 * @param {Set<string>} assetUrls - Set of asset URLs that should be updated
 * @param {string} daContentUrl - The content.da.live URL
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} Updated HTML content with modified hrefs and srcs
 */
function updateAssetReferencesInHTML(fullShadowPath, htmlContent, assetUrls, daContentUrl, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;
  
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
        element.setAttribute(attribute, `${daContentUrl}/${fullShadowPath}/${filename}`);
      }
    });
  });
  
  return dom.serialize();
}

/**
 * Update page references in the HTML content to point to their DA location
 * @param {string} htmlContent - The HTML content to update
 * @param {string} daContentUrl - The content.da.live URL
 * @param {Array<string>} matchingAssetUrls - Array of matching asset URLs
 * @param {string} siteOrigin - The site origin
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} Updated HTML content
 */
export function updatePageReferencesInHTML(htmlContent, daContentUrl, matchingAssetUrls, siteOrigin, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep, chalk: chalkDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;

  // if siteOrigin is not provided, we can't identify same site page references
  if (!siteOrigin) {
    return htmlContent;
  }
  
  let updatedCount = 0;
  
  // Get all anchor tags and update their href attributes
  document.querySelectorAll('a[href]').forEach(element => {
    const url = element.getAttribute('href');
    // Skip if this URL is in the matching asset URLs (already handled by updateImagesInHTML)
    if (matchingAssetUrls.includes(url)) {
      return;
    }
    // if the url starts with http, and is not a localhost url, and is doesn't start with the site origin, then no need to update it
    if (url.startsWith('http') && !url.startsWith(LOCALHOST_URL) && !url.startsWith(siteOrigin)) {
      return;
    }

    // now we can assume that the reference points to a page on the same site
    // get the pathname from the href url, without the extension
    const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
    const parsedPath = path.parse(urlObj.pathname);
    const pathWithoutExtension = path.join(parsedPath.dir, parsedPath.name);
    // update the href attribute to point to the DA content location
    const newUrl = pathWithoutExtension.startsWith('/') 
      ? `${daContentUrl}${pathWithoutExtension}`
      : `${daContentUrl}/${pathWithoutExtension}`;
    element.setAttribute('href', newUrl);
    updatedCount++;
  });
  
  if (updatedCount > 0) {
    console.log(chalkDep.cyan(`Updated ${updatedCount} page references to point to DA location`));
  }

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
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} downloadFolder - Base download folder for relative path calculation
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadPageAssets(shadowFolderPath, daAdminUrl, token, uploadOptions, downloadFolder, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFolder: uploadFolderDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading assets for page to ${shadowFolderPath}...`));
  try {
    await uploadFolderDep(shadowFolderPath, daAdminUrl, token, {
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
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {string} htmlFolder - Base HTML folder for relative path calculation
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
async function uploadHTMLPage(pagePath, daAdminUrl, token, uploadOptions, htmlFolder, dependencies = defaultDependencies) {
  const { chalk: chalkDep, uploadFile: uploadFileDep } = dependencies;
  
  console.log(chalkDep.yellow(`Uploading updated HTML page: ${pagePath}...`));
  try {
    await uploadFileDep(pagePath, daAdminUrl, token, {
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
 * Calculate the HTML path and base folder for saving to download folder
 * @param {string} pagePath - Original path to the HTML page
 * @param {string} htmlFolder - Base HTML folder
 * @param {string} downloadFolder - Base download folder
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Object} Object containing the updated HTML path and base folder
 */
function calculateHtmlPathAndBaseFolder(pagePath, htmlFolder, downloadFolder, dependencies = defaultDependencies) {
  const { path: pathDep } = dependencies;
  
  // Calculate relative path from HTML folder to preserve folder structure
  const htmlRelativePath = pathDep.relative(htmlFolder, pagePath);
  const updatedHtmlPath = pathDep.join(downloadFolder, 'html', htmlRelativePath);
  const htmlBaseFolder = pathDep.join(downloadFolder, 'html');
  
  return {
    updatedHtmlPath,
    htmlBaseFolder,
  };
}

/**
 * Save HTML content to download folder
 * @param {string} htmlContent - HTML content to save
 * @param {string} updatedHtmlPath - Path where to save the HTML content
 * @param {Object} dependencies - Dependencies for testing (optional)
 */
function saveHtmlToDownloadFolder(htmlContent, updatedHtmlPath, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep, path: pathDep } = dependencies;
  
  const updatedHtmlDir = pathDep.dirname(updatedHtmlPath);
  
  // Create directory structure for HTML
  if (!fsDep.existsSync(updatedHtmlDir)) {
    fsDep.mkdirSync(updatedHtmlDir, { recursive: true });
  }
  
  // Save HTML content to download folder
  fsDep.writeFileSync(updatedHtmlPath, htmlContent, UTF8_ENCODING);
  console.log(chalkDep.green(`Saved page to download folder: ${updatedHtmlPath}`));
}

/**
 * Clean up downloaded assets and HTML files for a page to free disk space
 * @param {Array<string>} pathsToClean - Array of file/folder paths to clean up
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @param {Function} callback - The callback function to execute after cleanup
 */
async function cleanupPageAssets(pathsToClean, dependencies) {
  const { fs: fsDep, chalk: chalkDep } = dependencies;
  
  for (const path of pathsToClean) {
    try {
      // Check if path exists before trying to delete
      if (fsDep.existsSync(path)) {
        const stats = fsDep.statSync(path);
        
        if (stats.isDirectory()) {
          // For directories, use recursive removal
          fsDep.rmSync(path, { recursive: true, force: true });
        } else if (stats.isFile()) {
          // For files, use unlink
          fsDep.unlinkSync(path);
        }
      }
    } catch (err) {
      console.warn(chalkDep.yellow(`Warning: Could not clean up ${path}:`, err.message));
    }
  }
}

/**
 * Get fully qualified asset URL from an asset URL and a site origin
 * @param {string} assetUrl - The asset URL
 * @param {string} siteOrigin - The site origin
 * @return {string} The fully qualified asset URL
 */
function getFullyQualifiedAssetUrl(assetUrl, siteOrigin) {
  if (!assetUrl || !siteOrigin) {
    return assetUrl;
  }

  // Case 1: Already a fully qualified URL
  if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
    // if it is a localhost url, replace it with the origin from the pageUrlObj
    if (assetUrl.startsWith(LOCALHOST_URL)) {
      const urlObj = new URL(assetUrl);
      return assetUrl.replace(urlObj.origin, siteOrigin);
    }
    return assetUrl; // return as is
  }

  // Case 2: Absolute asset reference (root relative), appending the asset path to the site origin
  return assetUrl.startsWith('/') ? `${siteOrigin}${assetUrl}` : `${siteOrigin}/${assetUrl}`;
}

/**
 * Get fully qualified asset URLs from a list of asset URLs and a site origin
 * @param {Array<string>} assetUrls - List of asset URLs
 * @param {string} siteOrigin - The site origin
 * @return {Array<string>} List of fully qualified asset URLs, or the original list if siteOrigin is not provided.
 */
export function getFullyQualifiedAssetUrls(assetUrls, siteOrigin) {
  if (!assetUrls || !siteOrigin) {
    return assetUrls;
  }
  const fullyQualifiedAssetUrls = [];
  // loop over the assetUrls and get the fully qualified url
  for (const assetUrl of assetUrls) {
    fullyQualifiedAssetUrls.push(getFullyQualifiedAssetUrl(assetUrl, siteOrigin));
  }
  return fullyQualifiedAssetUrls;
}

/**
 * Process a single HTML page with assets
 * @param {string} pagePath - Path to the HTML page
 * @param {string} htmlFolder - Base HTML folder
 * @param {string} downloadFolder - Base download folder
 * @param {Set<string>} assetUrls - Set of asset URLs to match
 * @param {string} siteOrigin - The site origin
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} daContentUrl - The content.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options including maxRetries and retryDelay
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Processing result for the page
 */
async function processSinglePage(pagePath, htmlFolder, downloadFolder, assetUrls, siteOrigin, daAdminUrl,
  daContentUrl, token, uploadOptions, dependencies = defaultDependencies) {
  const { fs: fsDep, chalk: chalkDep, path: pathDep } = dependencies;
  const { maxRetries = 3, retryDelay = 5000 } = uploadOptions;
  
  console.log(chalkDep.blue(`\nProcessing page: ${pagePath}`));
  
  try {
    // Read the HTML file
    const htmlContent = fsDep.readFileSync(pagePath, UTF8_ENCODING);
    
    // Extract URLs from the HTML
    const urls = extractUrlsFromHTML(htmlContent, dependencies);
    
    // Find URLs that match asset URLs
    // Decode the URLs and then match
    const matchingAssetUrls = urls.filter(url => {
      try {
        const decodedUrl = decodeURIComponent(url);
        return assetUrls.has(decodedUrl) || assetUrls.has(url);
      } catch (error) {
        // If decoding fails, try matching the original URL
        return assetUrls.has(url);
      }
    });
    console.log(chalkDep.yellow(`Found ${matchingAssetUrls.length} asset references.`));
    
    if (matchingAssetUrls.length > 0) {
      // Get fully qualified asset URLs to download from the source
      const fullyQualifiedAssetUrls = getFullyQualifiedAssetUrls(matchingAssetUrls, siteOrigin);

      // Extract page name from pagePath to create shadow folder
      const pageName = pathDep.basename(pagePath, pathDep.extname(pagePath));
      const shadowFolder = `.${pageName}`;
      
      // Calculate relative path from HTML folder to preserve folder structure
      const relativePath = pathDep.relative(htmlFolder, pathDep.dirname(pagePath));
      const fullShadowPath = relativePath ? pathDep.join(relativePath, shadowFolder) : shadowFolder;
      const assetDownloadFolder = pathDep.join(downloadFolder, 'assets');
      const shadowFolderPath = pathDep.join(assetDownloadFolder, fullShadowPath);
      
      // Download assets for this page
      const downloadResults = await downloadPageAssets(fullyQualifiedAssetUrls, fullShadowPath, assetDownloadFolder, maxRetries, retryDelay, dependencies);
      
      // Upload assets for this page immediately
      await uploadPageAssets(shadowFolderPath, daAdminUrl, token, uploadOptions, assetDownloadFolder, dependencies);
      
      // Make reference updates:
      // 1. Update page references in the HTML content to point to their DA location
      let updatedHtmlContent = updatePageReferencesInHTML(htmlContent, daContentUrl, matchingAssetUrls, siteOrigin, dependencies);
      // 2. Update the asset references in the HTML content
      updatedHtmlContent = updateAssetReferencesInHTML(fullShadowPath, updatedHtmlContent, new Set(matchingAssetUrls), daContentUrl, dependencies);

      // Calculate the path for updated HTML content
      const { updatedHtmlPath, htmlBaseFolder } = calculateHtmlPathAndBaseFolder(pagePath, htmlFolder, downloadFolder, dependencies);
      
      // Save updated HTML content to download folder
      saveHtmlToDownloadFolder(updatedHtmlContent, updatedHtmlPath, dependencies);
      
      // Upload the updated HTML page from the download folder
      await uploadHTMLPage(updatedHtmlPath, daAdminUrl, token, uploadOptions, htmlBaseFolder, dependencies);
      
      // Clean up downloaded assets and HTML for this page to free disk space
      const assetFolderPath = pathDep.join(assetDownloadFolder, fullShadowPath);
      await cleanupPageAssets([updatedHtmlPath, assetFolderPath], dependencies);
      
      return {
        filePath: pagePath,
        updatedContent: updatedHtmlContent,
        downloadedAssets: matchingAssetUrls,
        downloadResults,
        uploaded: true,
      };
      
    } else {
      // No matching assets found, save HTML to download folder and upload as-is
      console.log(chalkDep.gray(`No asset references found for page ${pagePath}, saving to download folder and uploading as-is...`));
      
      // Calculate the path for HTML content
      const { updatedHtmlPath, htmlBaseFolder } = calculateHtmlPathAndBaseFolder(pagePath, htmlFolder, downloadFolder, dependencies);
      
      saveHtmlToDownloadFolder(htmlContent, updatedHtmlPath, dependencies);
      
      try {
        await uploadHTMLPage(updatedHtmlPath, daAdminUrl, token, uploadOptions, htmlBaseFolder, dependencies);
      } catch (uploadError) {
        console.error(chalkDep.red(`Error uploading HTML page ${updatedHtmlPath}:`, uploadError.message));
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
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} daContentUrl - The content.da.live URL
 * @param {Set<string>} assetUrls - Set of asset URLs to match and download
 * @param {string} siteOrigin - The site origin
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
export async function processPages(daAdminUrl, daContentUrl, assetUrls, siteOrigin, htmlFolder, downloadFolder, token, uploadOptions = {}, dependencies = defaultDependencies) {
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
      siteOrigin,
      daAdminUrl,
      daContentUrl,
      token,
      uploadOptions,
      dependencies,
    );
    
    results.push(result);
  }
  
  await cleanupPageAssets([downloadFolder], dependencies);

  // Summary
  const successfulPages = results.filter(page => !page.error).length;
  const totalAssets = results.reduce((sum, page) => sum + page.downloadedAssets.length, 0);
  
  console.log(chalkDep.green('\nProcessing complete!'));
  console.log(chalkDep.green(`- Processed ${successfulPages}/${htmlPages.length} pages successfully`));
  console.log(chalkDep.green(`- Downloaded and uploaded ${totalAssets} assets`));
  
  return results;
}