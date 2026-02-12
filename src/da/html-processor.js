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
import { DO_NOT_CONVERT_EXTENSIONS } from '../utils/download-assets.js';
import { uploadFile } from './upload.js';
import { 
  getSanitizedFilenameFromUrl, 
  generateDocumentPath, 
  extractPageParentPath, 
  buildEdgeDeliveryUrl,
  buildDaContentUrl,
} from './url-utils.js';
import { isImageAsset } from './asset-processor.js';

// Constants
const UTF8_ENCODING = 'utf-8';
const LOCALHOST_URL = 'http://localhost';

// Default dependencies for production use
const defaultDependencies = {
  fs,
  path,
  JSDOM,
  uploadFile,
  chalk: null, // Will be provided when used
};

/**
 * Extract URLs from HTML content that match certain patterns
 * @param {string} htmlContent - The HTML content to parse
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of URLs found in the HTML
 */
export function extractUrlsFromHTML(htmlContent, dependencies = defaultDependencies) {
  const { JSDOM: JSDOMDep = JSDOM } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;

  const urls = [];
  
  // Extract href attributes from anchor tags
  document.querySelectorAll('a[href]').forEach(element => {
    const href = element.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      urls.push(href);
    }
  });

  // Extract src attributes from img tags
  document.querySelectorAll('img[src]').forEach(element => {
    const src = element.getAttribute('src');
    if (src) {
      urls.push(src);
    }
  });

  return urls;
}

/**
 * Update asset references in HTML content to use DA URLs (images point to shadow folders, non-images to shared-media folders).
 * @param {string} fullShadowPath - The full shadow folder path
 * @param {string} htmlContent - The HTML content to update
 * @param {Set<string>} assetUrls - Set of asset URLs that should be updated
 * @param {string} org - The organization name
 * @param {string} site - The site name
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @param {Object} options - Options for the function
 * @param {boolean} options.imagesToPng - Whether to convert images to PNG
 * @return {string} Updated HTML content with modified hrefs and srcs
 */
export function updateAssetReferencesInHTML(
  fullShadowPath,
  htmlContent,
  assetUrls,
  org,
  site,
  dependencies = defaultDependencies,
  options = {},
) {
  const { JSDOM: JSDOMDep = JSDOM, path: pathDep = path, chalk: chalkDep } = dependencies;
  const dom = new JSDOMDep(htmlContent);
  const document = dom.window.document;

  // Extract page parent path from fullShadowPath
  const pageParentPath = extractPageParentPath(fullShadowPath);
  // Map of CSS selectors to their corresponding attribute names
  // Add more pairs as needed
  const selectorAttrMap = new Map([
    ['a[href]', 'href'],
    ['img[src]', 'src'],
  ]);
  let updatedAssetCount = 0;

  console.log(chalkDep.cyan('Updating asset references in page:'));
  const shouldConvertImages = options.imagesToPng ?? true;

  selectorAttrMap.forEach((attribute, selector) => {
    document.querySelectorAll(selector).forEach(element => {
      const url = element.getAttribute(attribute);
      if (assetUrls.has(url)) {
        let sanitizedFilename = getSanitizedFilenameFromUrl(url);
        const ext = pathDep.extname(sanitizedFilename).toLowerCase();
        const base = pathDep.basename(sanitizedFilename, ext);
        
        if (shouldConvertImages && !DO_NOT_CONVERT_EXTENSIONS.has(ext)) {
          sanitizedFilename = `${base}.png`;
        }

        const isImage = isImageAsset(sanitizedFilename, dependencies);

        if (isImage) {
          // Images urls point to ${daContentUrl}/${fullShadowPath}/${sanitizedFilename}
          // and are referenced via the same URL
          const daContentUrl = buildDaContentUrl(org, site);
          const fullImageUrl = `${daContentUrl}/${fullShadowPath}/${sanitizedFilename}`;
          console.log(chalkDep.cyan(`  Image: ${url} → ${fullImageUrl}`));
          element.setAttribute(attribute, fullImageUrl);
        } else {
          // Non-image asset urls should point to their Edge Delivery preview URLs
          const pageParentUrlPath = pageParentPath ? pageParentPath.replace(/\\/g, '/') : '';
          const mediaPath = pageParentUrlPath
            ? `${pageParentUrlPath}/shared-media/${sanitizedFilename}`
            : `shared-media/${sanitizedFilename}`;
          const edgeUrl = buildEdgeDeliveryUrl(org, site, mediaPath);
          console.log(chalkDep.cyan(`  Media: ${url} → ${edgeUrl}`));
          element.setAttribute(attribute, edgeUrl);
        }
        updatedAssetCount++;
      }
    });
  });

  if (updatedAssetCount > 0) {
    console.log(chalkDep.green(`Updated ${updatedAssetCount} asset references`));
  }

  return serializeToContent(dom);
}

/**
 * Serialize JSDOM document to body content only (no document wrapper).
 * JSDOM always parses into a full document; serialize() would output <html><head></head><body>...</body></html>.
 * We return body.innerHTML so output is just the content, without adding that wrapper.
 * @param {JSDOM} dom - The JSDOM instance
 * @return {string} Body inner HTML
 */
function serializeToContent(dom) {
  const body = dom.window.document.body;
  const result = body ? body.innerHTML : dom.serialize();
  console.log(result);
  return result;
}

/**
 * Update page references in the HTML content to point to their DA location
 * @param {string} htmlContent - The HTML content to update
 * @param {Array<string>} matchingAssetUrls - Array of matching asset URLs
 * @param {string} siteOrigin - The site origin
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} Updated HTML content
 */
export function updatePageReferencesInHTML(
  htmlContent,
  matchingAssetUrls,
  siteOrigin,
  dependencies = defaultDependencies,
) {
  const { JSDOM: JSDOMDep = JSDOM, chalk: chalkDep } = dependencies;
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
    if (typeof url === 'string' && /^(mailto|tel):/i.test(url)) {
      return;
    }
    // Skip if this URL is in the matching asset URLs (already handled by updateAssetReferencesInHTML)
    if (matchingAssetUrls.includes(url)) {
      return;
    }
    // Skip if this URL is not a same site page reference
    if (url.startsWith('http') && !url.startsWith(LOCALHOST_URL) && !url.startsWith(siteOrigin)) {
      return;
    }

    // now we can assume that the reference points to a page on the same site
    // sanitize and normalize using generateDocumentPath
    const newUrl = generateDocumentPath(url);
    element.setAttribute('href', newUrl);
    updatedCount++;
  });

  if (updatedCount > 0) {
    console.log(chalkDep.cyan(`Updated ${updatedCount} page references to point to DA location`));
  }

  return serializeToContent(dom);
}

/**
 * Normalize HTML filename: multi-dot names like index.plain.html or foo.bar.html become index.html / foo.html.
 * Only renames when there are at least two dots (e.g. name.suffix.html); single-dot page.html is unchanged.
 * @param {string} basename - File basename (e.g. index.plain.html, foo.bar.html)
 * @return {string} Normalized basename (e.g. index.html, foo.html)
 */
function normalizeHtmlBasename(basename) {
  return basename.replace(/^([^.]+)\..+\.html$/i, '$1.html');
}

/**
 * Get save location for HTML file operations, fixing the file name to be compatible with DA (single-dot extensions names are required)
 * @param {string} pagePath - Original path to the HTML page
 * @param {string} htmlFolder - Base HTML folder
 * @param {string} downloadFolder - Base download folder
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {string} HTML path for saving
 */
export function getSaveLocation(pagePath, htmlFolder, downloadFolder, dependencies = defaultDependencies) {
  const { path: pathDep = path } = dependencies;

  let htmlRelativePath = pathDep.relative(htmlFolder, pagePath);
  const dir = pathDep.dirname(htmlRelativePath);
  const basename = pathDep.basename(htmlRelativePath);

  // fix the file name to be compatible with DA (single-dot extensions names are required)
  const normalizedBasename = normalizeHtmlBasename(basename);
  
  if (normalizedBasename !== basename) {
    htmlRelativePath = pathDep.join(dir, normalizedBasename);
  }

  return pathDep.join(downloadFolder, 'html', htmlRelativePath);
}

/**
 * Save HTML content to download folder
 * @param {string} htmlContent - HTML content to save
 * @param {string} updatedHtmlPath - Path where to save the HTML content
 * @param {Object} dependencies - Dependencies for testing (optional)
 */
export function saveHtmlToDownloadFolder(htmlContent, updatedHtmlPath, dependencies = defaultDependencies) {
  const { fs: fsDep = fs, chalk: chalkDep, path: pathDep = path } = dependencies;

  const updatedHtmlDir = pathDep.dirname(updatedHtmlPath);

  fsDep.mkdirSync(updatedHtmlDir, { recursive: true });

  fsDep.writeFileSync(updatedHtmlPath, htmlContent, UTF8_ENCODING);
  console.log(chalkDep.green(`Saved page to download folder: ${updatedHtmlPath}`));
}

/**
 * Wrap HTML content with body/main tags if they don't exist
 * @param {string} htmlContent - The HTML content to wrap
 * @return {string} Wrapped HTML content
 */
function wrapHtmlContent(htmlContent) {
  const trimmed = htmlContent.trim();
  const lowerContent = trimmed.toLowerCase();
  
  // Check if content already starts with <body><main>
  const hasBody = lowerContent.startsWith('<body><main>');
  
  if (hasBody) {
    return htmlContent;
  }
  
  return `<body><main>${htmlContent}</main></body>`;
}

/**
 * Upload an HTML page to DA
 * @param {string} pagePath - Path to the HTML page file
 * @param {string} daAdminUrl - The admin.da.live URL
 * @param {string} token - Authentication token
 * @param {Object} uploadOptions - Upload options
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<void>}
 */
export async function uploadHTMLPage(
  pagePath,
  daAdminUrl,
  token,
  uploadOptions,
  dependencies = defaultDependencies,
) {
  const { chalk: chalkDep, uploadFile: uploadFileDep = uploadFile, path: pathDep = path, fs: fsDep = fs } = dependencies;

  // Calculate baseFolder - should be the download folder + 'html' part
  // For path like 'da-content/html/about-us/leadership/executive.html'
  // we want baseFolder to be 'da-content/html'
  const pathParts = pagePath.split(pathDep.sep);
  const htmlIndex = pathParts.findIndex(part => part === 'html');
  const baseFolder = pathParts.slice(0, htmlIndex + 1).join(pathDep.sep);

  console.log(chalkDep.yellow(`Uploading updated HTML page: ${pagePath}...`));
  try {
    // Patch HTML for valid DA page structure
    const originalContent = fsDep.readFileSync(pagePath, UTF8_ENCODING);
    const wrappedContent = wrapHtmlContent(originalContent);
    
    // Only rewrite if content changed
    if (wrappedContent !== originalContent) {
      fsDep.writeFileSync(pagePath, wrappedContent, UTF8_ENCODING);
    }

    await uploadFileDep(pagePath, daAdminUrl, token, {
      ...uploadOptions,
      baseFolder,
    });
    console.log(chalkDep.green(`Successfully uploaded HTML page: ${pagePath}`));
  } catch (uploadError) {
    console.error(chalkDep.red(`Error uploading HTML page: ${pagePath}:`, uploadError.message));
    throw uploadError;
  }
}
