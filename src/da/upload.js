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
import FormData from 'form-data';
import fetch from 'node-fetch';
import chalk from 'chalk';

// Default dependencies for production use
const defaultDependencies = {
  fs,
  path,
  FormData,
  fetch,
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

// Update default dependencies to include the local getAllFiles
defaultDependencies.getAllFiles = getAllFiles;

/**
 * Upload a file to the DA system
 * @param {string} filePath - The absolute path to the file to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} authToken - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {string} options.userAgent - Custom User-Agent header (default: 'aem-import-helper/1.0')
 * @param {boolean} options.withCredentials - Whether to include credentials (default: true)
 * @param {string} options.baseFolder - The base folder path to calculate relative path from
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} The upload response
 */
export async function uploadFile(filePath, uploadUrl, authToken, options = {}, dependencies = defaultDependencies) {
  const {
    userAgent = 'aem-import-helper/1.0',
    baseFolder = '',
  } = options;

  const { fs: fsDep, path: pathDep, FormData: FormDataDep, fetch: fetchDep, chalk: chalkDep } = dependencies;

  try {
    // Validate file exists
    if (!fsDep.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Calculate relative path from base folder
    let relativePath = filePath;
    if (baseFolder && filePath.startsWith(baseFolder)) {
      relativePath = pathDep.relative(baseFolder, filePath);
    }

    // Construct the full upload URL with the file path
    const fullUploadUrl = `${uploadUrl}/${relativePath}`;

    // Create FormData
    const formData = new FormDataDep();
    formData.append('data', fsDep.createReadStream(filePath));

    // Prepare headers
    const headers = {
      'User-Agent': userAgent,
      ...formData.getHeaders(),
    };

    // Add authorization header if token is provided
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Prepare fetch options
    const fetchOptions = {
      method: 'POST',
      headers,
      body: formData,
    };

    console.log(chalkDep.yellow(`Uploading file: ${filePath}`));
    console.log(chalkDep.yellow(`Relative path: ${relativePath}`));
    console.log(chalkDep.yellow(`Upload URL: ${fullUploadUrl}`));

    // Make the upload request
    const response = await fetchDep(fullUploadUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status} - ${response.statusText}`);
    }

    const responseText = await response.text();
    
    console.debug(chalkDep.green(`File uploaded successfully: ${filePath}`));
    console.debug(chalkDep.blue(`Response: ${responseText}`));

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      responseText,
      filePath,
      relativePath,
      uploadUrl: fullUploadUrl,
    };

  } catch (error) {
    console.error(chalkDep.red(`Upload failed for ${filePath}: ${error.message}`));
    throw error;
  }
}

/**
 * Upload multiple files to the DA system
 * @param {Array<string>} filePaths - Array of absolute file paths to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} authToken - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array<Object>>} Array of upload results
 */
export async function uploadFiles(filePaths, uploadUrl, authToken, options = {}, dependencies = defaultDependencies) {
  const results = [];
  
  for (const filePath of filePaths) {
    try {
      const result = await uploadFile(filePath, uploadUrl, authToken, options, dependencies);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        filePath,
      });
    }
  }

  return results;
}

/**
 * Upload all files from a folder recursively to the DA system
 * @param {string} folderPath - The absolute path to the folder to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} authToken - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {Array<string>} options.fileExtensions - Array of file extensions to include (e.g., ['.html', '.css', '.js'])
 * @param {Array<string>} options.excludePatterns - Array of patterns to exclude (e.g., ['node_modules', '.git'])
 * @param {boolean} options.verbose - Whether to show detailed progress (default: false)
 * @param {string} options.baseFolder - The base folder to calculate relative paths from (default: folderPath)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Upload results with summary
 */
export async function uploadFolder(folderPath, uploadUrl, authToken, options = {}, dependencies = defaultDependencies) {
  const {
    fileExtensions = ['.html', '.htm'],
    excludePatterns = [],
    verbose = false,
    baseFolder = folderPath, // Default to folderPath if not provided
  } = options;

  const { fs: fsDep, chalk: chalkDep, getAllFiles: getAllFilesDep } = dependencies;

  try {
    // Validate folder exists
    if (!fsDep.existsSync(folderPath)) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    const stat = fsDep.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }

    console.log(chalkDep.yellow(`Scanning folder: ${folderPath}`));
    // Get all files recursively
    let allFiles = getAllFilesDep(folderPath, fileExtensions);
    
    // Apply exclude patterns
    if (excludePatterns.length > 0) {
      allFiles = allFiles.filter(filePath => {
        return !excludePatterns.some(pattern => {
          return filePath.includes(pattern);
        });
      });
    }

    if (allFiles.length === 0) {
      console.log(chalkDep.yellow('No files found to upload'));
      return {
        success: true,
        totalFiles: 0,
        uploadedFiles: 0,
        failedFiles: 0,
        results: [],
      };
    }

    console.log(chalkDep.yellow(`Found ${allFiles.length} files to upload`));
    
    if (verbose) {
      allFiles.forEach(file => {
        console.log(chalkDep.blue(`  - ${file}`));
      });
    }

    // Upload files individually using uploadFile
    const results = [];
    for (const filePath of allFiles) {
      try {
        const result = await uploadFile(filePath, uploadUrl, authToken, {
          ...options,
          baseFolder: baseFolder, // Use the baseFolder parameter
        }, dependencies);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          filePath,
        });
      }
    }
    
    // Calculate summary
    const successfulUploads = results.filter(r => r.success);
    const failedUploads = results.filter(r => !r.success);
    
    const summary = {
      success: failedUploads.length === 0,
      totalFiles: allFiles.length,
      uploadedFiles: successfulUploads.length,
      failedFiles: failedUploads.length,
      results: results,
    };

    // Log summary
    console.log(chalkDep.green('\nUpload Summary:'));
    console.log(chalkDep.green(`  Total files: ${summary.totalFiles}`));
    console.log(chalkDep.green(`  Successfully uploaded: ${summary.uploadedFiles}`));
    
    if (summary.failedFiles > 0) {
      console.log(chalkDep.red(`  Failed uploads: ${summary.failedFiles}`));
      failedUploads.forEach(failed => {
        console.log(chalkDep.red(`    - ${failed.filePath}: ${failed.error}`));
      });
    }

    return summary;

  } catch (error) {
    console.error(chalkDep.red(`Folder upload failed: ${error.message}`));
    throw error;
  }
}
