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
import crypto from 'crypto';

// Constants
const LOCALHOST_URL = 'http://localhost';
const DA_BASE_URL = 'https://admin.da.live';
const DA_CONTENT_URL = 'https://content.da.live';

/**
 * Sanitize filename
 * Ported from https://github.com/adobe/helix-importer
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name) return '';
  return decodeURIComponent(name).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sanitize path
 * Ported from https://github.com/adobe/helix-importer
 * @param {string} p
 * @returns {string}
 */
export function sanitizePath(p) {
  if (!p) return '';
  const extension = p.split('.').pop();
  const pathname = extension !== p ? p.substring(0, p.lastIndexOf('.')) : p;
  let sanitizedPath = '';
  pathname.split('/').forEach((seg) => {
    if (seg !== '') {
      sanitizedPath += `/${sanitizeFilename(seg)}`;
    }
  });
  if (extension !== p) {
    sanitizedPath += `.${extension}`;
  }
  return sanitizedPath || '/';
}

/**
 * Get filename from URL
 * @param {string} url - The URL
 * @return {string} Filename
 */
export function getFilename(url) {
  const u = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
  return path.basename(u.pathname);
}

/**
 * Get path from URL
 * @param {string} url - The URL
 * @return {string} Path
 */
export function getPath(url) {
  const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
  return urlObj.pathname;
}

/**
 * Generate sanitized, extension-less document path
 * - decodes, lowercases
 * - strips .html/.htm
 * - replaces non [a-z0-9/] with '-'
 * - converts trailing '/index' to '/'
 * - removes trailing slash (except root)
 * @param {string} url
 * @returns {string}
 */
export function generateDocumentPath(url) {
  // Support relative URLs by resolving against localhost base
  const u = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
  let p = u.pathname;
  p = decodeURIComponent(p)
    .toLowerCase()
    .replace(/\.(html|htm)$/i, '')
    .replace(/[^a-z0-9/]/gm, '-')
    .replace(/\/index$/, '/');
  if (p === '/') {
    return p;
  }
  if (p.endsWith('/')) {
    p = p.slice(0, -1);
  }

  return sanitizePath(p);
}

/**
 * Extract page parent path from fullShadowPath
 * Removes the last segment (e.g., /.page-name) to get the parent path
 * @param {string} fullShadowPath - The full shadow path (e.g., "documents/reports/.page-name")
 * @return {string} The parent path (e.g., "documents/reports") or empty string if no parent
 */
export function extractPageParentPath(fullShadowPath) {
  if (!fullShadowPath || fullShadowPath.startsWith('.')) {
    // If fullShadowPath is just ".page-name" (no parent), return empty string
    return '';
  }
  
  // Remove the last segment (the shadow folder part like "/.page-name")
  const lastSlashIndex = fullShadowPath.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return '';
  }
  
  return fullShadowPath.substring(0, lastSlashIndex);
}

/**
 * Build DA admin URL
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @return {string} DA admin URL
 */
export function buildDaAdminUrl(org, site) {
  return `${DA_BASE_URL}/source/${org}/${site}`;
}

/**
 * Build DA content URL
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @return {string} DA content URL
 */
export function buildDaContentUrl(org, site) {
  return `${DA_CONTENT_URL}/${org}/${site}`;
}

/**
 * Build DA list URL
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @return {string} DA list URL
 */
export function buildDaListUrl(org, site) {
  return `${DA_BASE_URL}/list/${org}/${site}`;
}

/**
 * Build Edge Delivery preview URL
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} path - Asset path
 * @return {string} Edge Delivery URL
 */
export function buildEdgeDeliveryUrl(org, site, path) {
  // Ensure path starts with / but doesn't have double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://main--${site}--${org}.aem.page/${cleanPath}`;
}

/**
 * Get fully qualified asset URL from a single asset URL and site origin
 * @param {string} assetUrl - The asset URL
 * @param {string} siteOrigin - The site origin
 * @return {string} The fully qualified asset URL
 */
function getFullyQualifiedAssetUrl(assetUrl, siteOrigin) {
  if (!assetUrl || !siteOrigin) {
    return assetUrl;
  }

  // Case 1: Already a fully qualified URL
  if (assetUrl.startsWith('http')) {
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
 * Get sanitized filename with extension from a URL.
 * @param {string} url - The URL to extract and sanitize the filename from
 * @return {string} Sanitized filename with preserved extension
 */
export function getSanitizedFilenameFromUrl(url) {
  // Try to find a filename with extension in the URL path
  const u = url.startsWith('http') ? new URL(url) : new URL(url, LOCALHOST_URL);
  const pathSegments = u.pathname.split('/').filter(Boolean);
  
  // Look for a segment with an extension (e.g., "diabetologie.svg" in path)
  let filename = null;
  for (let i = pathSegments.length - 1; i >= 0; i--) {
    const segment = pathSegments[i];
    if (segment.includes('.')) {
      filename = segment;
      break;
    }
  }
  
  // If no segment with extension found, use the last segment
  if (!filename) {
    filename = pathSegments[pathSegments.length - 1] || 'asset';
  }
  
  const parts = filename.split('.');
  let ext = parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';
  const base = parts.join('.');
  const sanitizedBase = sanitizeFilename(base);

  // If no extension detected, try to infer from URL pattern
  if (!ext) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('-svg') || urlLower.includes('/svg')) {
      ext = '.svg';
    } else if (urlLower.includes('-jpg') || urlLower.includes('-jpeg')) {
      ext = '.jpg';
    } else if (urlLower.includes('-png')) {
      ext = '.png';
    } else if (urlLower.includes('-gif')) {
      ext = '.gif';
    } else if (urlLower.includes('-webp')) {
      ext = '.webp';
    }
  }

  // Always add hash suffix to ensure uniqueness
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);

  // Combine sanitized base with hash and extension
  return `${sanitizedBase}-${hash}${ext}`;
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
  for (const assetUrl of assetUrls) {
    fullyQualifiedAssetUrls.push(getFullyQualifiedAssetUrl(assetUrl, siteOrigin));
  }

  return fullyQualifiedAssetUrls;
}

