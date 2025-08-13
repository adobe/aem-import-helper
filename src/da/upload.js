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

// Constant for maximum concurrent uploads per page
const MAX_CONCURRENT_UPLOADS = 50;

/**
 * Recursively get all files from a directory with optional filtering by file extensions and exclude extensions.
 * @param {string} dirPath - The directory path to scan
 * @param {Array<string>} fileExtensions - Optional array of file extensions to filter (e.g., ['.html', '.css'])
 * @param {Array<string>} excludeExtensions - Optional array of file extensions to exclude (e.g., ['.docx'])
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Array<string>} Array of absolute file paths
 */
export function getAllFiles(dirPath, fileExtensions = [], excludeExtensions = [], dependencies = defaultDependencies) {
  const { fs: fsDep, path: pathDep } = dependencies;
  
  let files;
  try {
    files = fsDep.readdirSync(dirPath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => pathDep.join(entry.parentPath, entry.name))
      .filter((file) => {
        const ext = pathDep.extname(file);
        const included = fileExtensions.length === 0 || fileExtensions.includes(ext);
        const excluded = excludeExtensions.length > 0 && excludeExtensions.includes(ext);
        return included && !excluded;
      });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Folder not found: ${dirPath}`);
    }
    throw e;
  }

  return files;
}

/**
 * Create FormData and fetch options for file upload
 * @param {string} filePath - The absolute path to the file to upload
 * @param {string} userAgent - Custom User-Agent header
 * @param {string} token - The authentication token
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Object} Object containing formData and fetchOptions
 */
function createUploadRequest(filePath, userAgent, token, dependencies = defaultDependencies) {
  const { fs: fsDep, FormData: FormDataDep } = dependencies;
  
  // Create FormData
  const formData = new FormDataDep();
  formData.append('data', fsDep.createReadStream(filePath));

  // Prepare headers
  const headers = {
    'User-Agent': userAgent,
    ...formData.getHeaders(),
  };

  // Add authorization header if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Prepare fetch options
  const fetchOptions = {
    method: 'POST',
    headers,
    body: formData,
  };

  return { formData, fetchOptions };
}

/**
 * Handle upload operation with consistent success/error formatting
 * @param {string} filePath - The absolute path to the file to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} token - The authentication token
 * @param {Object} options - Upload options (passed through to uploadFile)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Standardized upload result object
 */
async function uploadHandler(filePath, uploadUrl, token, options = {}, dependencies = defaultDependencies) {
  try {
    const result = await uploadFile(filePath, uploadUrl, token, options, dependencies);
    return { ...result, success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath,
    };
  }
}

/**
 * Upload a file to the Author Bus.
 * @param {string} filePath - The absolute path to the file to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} token - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {string} options.userAgent - Custom User-Agent header (default: 'aem-import-helper/1.0')
 * @param {string} options.baseFolder - The base folder path to calculate relative path from
 * @param {number} options.retries - Number of retry attempts on failure (default: 3)
 * @param {number} options.retryDelay - Delay in milliseconds between retries (default: 1000)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} The upload response
 */
export async function uploadFile(filePath, uploadUrl, token, options = {}, dependencies = defaultDependencies) {
  const {
    userAgent = 'aem-import-helper/1.0',
    baseFolder = '',
    retries = 3, // number of retries
    retryDelay = 1000, // delay in ms between retries
  } = options;

  const { fs: fsDep, path: pathDep, fetch: fetchDep, chalk: chalkDep } = dependencies;

  let attempts = 0;
  while (attempts <= retries) {
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

      // Create upload request
      const { fetchOptions } = createUploadRequest(filePath, userAgent, token, dependencies);

      console.log(chalkDep.yellow(`Uploading file '${filePath}' to '${fullUploadUrl}' (Attempt ${attempts + 1}/${retries + 1})`));

      // Make the upload request
      const response = await fetchDep(fullUploadUrl, fetchOptions);

      if (!response.ok) {
        // If it's the last attempt and still not OK, throw the error
        if (attempts === retries) {
          throw new Error(`Upload failed with status: ${response.status} - ${response.statusText}`);
        } else {
          // Log retry attempt and continue to next iteration
          console.warn(chalkDep.yellow(`Upload failed for ${filePath} with status: ${response.status}. Retrying in ${retryDelay}ms...`));
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          attempts++;
          continue; // Skip to the next iteration of the while loop
        }
      }

      const responseText = await response.text();

      console.log(chalkDep.green(`File uploaded successfully: ${filePath}`));

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
      if (attempts === retries) {
        console.error(chalkDep.red(`Upload failed for ${filePath} after ${retries + 1} attempts: ${error.message}`));
        throw error; // Re-throw error after all retries are exhausted
      } else {
        console.warn(chalkDep.yellow(`Upload failed for ${filePath}: ${error.message}. Retrying in ${retryDelay}ms...`));
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        attempts++;
      }
    }
  }
}

/**
 * Generate summary from upload results
 * @param {Array<Object>} results - Array of upload results
 * @param {number} totalFiles - Total number of files that were attempted to upload
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Object} Summary object with success status and counts
 */
function getSummaryFromUploadResults(results, totalFiles, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  
  const successfulUploads = results.filter(r => r.success);
  const failedUploads = results.filter(r => !r.success);
  
  const summary = {
    success: failedUploads.length === 0,
    totalFiles: totalFiles,
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
}

/**
 * Upload all files from a folder recursively to the DA system
 * @param {string} folderPath - The absolute path to the folder to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} token - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {Array<string>} options.fileExtensions - Array of file extensions to include (e.g., ['.html', '.htm'])
 * @param {string} options.baseFolder - The base folder to calculate relative paths from (default: folderPath)
 * @param {boolean} options.useBatching - Whether to use batched uploads (default: true)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Upload results with summary
 */
export async function uploadFolder(folderPath, uploadUrl, token, options = {}, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  const getFiles = dependencies.getAllFiles || getAllFiles;
  const { useBatching = true } = options;
  let results;

  // Set default baseFolder to folderPath if not provided
  const uploadOptions = {
    ...options,
    baseFolder: options.baseFolder || folderPath,
  };

  try {
    // Get all files recursively
    let allFiles = getFiles(folderPath, options.fileExtensions || [], dependencies);
    
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

    if (useBatching && allFiles.length > 1) {
      // Use batched upload for better performance
      results = await uploadFilesBatched(allFiles, uploadUrl, token, uploadOptions, dependencies);
    } else {
      // Use sequential upload for single files or when batching is disabled
      results = [];
      for (const filePath of allFiles) {
        const result = await uploadHandler(filePath, uploadUrl, token, uploadOptions, dependencies);
        results.push(result);
      }
    }
    
    // Calculate and log summary
    return getSummaryFromUploadResults(results, allFiles.length, dependencies);
  } catch (error) {
    console.error(chalkDep.red(`Folder upload failed: ${error.message}`));
    throw error;
  }
}

/**
 * Upload files in batches with controlled concurrency
 * @param {Array<string>} filePaths - Array of file paths to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} token - The authentication token
 * @param {Object} options - Upload options (passed through to uploadFile)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Array>} Array of upload results
 */
export async function uploadFilesBatched(filePaths, uploadUrl, token, options = {}, dependencies = defaultDependencies) {
  const { chalk: chalkDep } = dependencies;
  
  if (filePaths.length === 0) {
    return [];
  }
  
  const allResults = [];
  const batchSize = MAX_CONCURRENT_UPLOADS;
  
  // Process files in batches
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(filePaths.length / batchSize);
    
    console.log(chalkDep.cyan(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)...`));
    
    // Upload files in current batch concurrently
    const batchPromises = batch.map(filePath => uploadHandler(filePath, uploadUrl, token, options, dependencies));
    
    // Wait for current batch to complete
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);
    
    // Log batch summary
    const batchSuccess = batchResults.filter(r => r.success).length;
    const batchFailed = batchResults.filter(r => !r.success).length;
    
    console.log(chalkDep.green(`Batch ${batchNumber} complete: ${batchSuccess} successful, ${batchFailed} failed`));
  }
  
  return allResults;
}