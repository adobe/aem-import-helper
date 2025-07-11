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
export function getAllHtmlFiles(dirPath, options = {}, dependencies = defaultDependencies) {
  const { fileExtensions = [] } = options;
  const { fs: fsDep, path: pathDep } = dependencies;
  
  let files;
  try {
    files = fsDep.readdirSync(dirPath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => pathDep.join(entry.parentPath, entry.name));
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Folder not found: ${dirPath}`);
    }
    throw e;
  }

  if (fileExtensions.length > 0) {
    return files.filter((file) => fileExtensions.includes(pathDep.extname(file)));
  }
  return files;
}


/**
 * Upload a file to the Author Bus.
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
    retries = 3, // number of retries
    retryDelay = 1000, // delay in ms between retries
  } = options;

  const { fs: fsDep, path: pathDep, FormData: FormDataDep, fetch: fetchDep, chalk: chalkDep } = dependencies;

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

      console.debug(chalkDep.green(`File uploaded successfully: ${filePath}`));

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
 * Upload all files from a folder recursively to the DA system
 * @param {string} folderPath - The absolute path to the folder to upload
 * @param {string} uploadUrl - The DA upload URL base
 * @param {string} authToken - The authentication token
 * @param {Object} options - Additional options for the upload
 * @param {Array<string>} options.fileExtensions - Array of file extensions to include (e.g., ['.html', '.html'])
 * @param {boolean} options.verbose - Whether to show detailed progress (default: false)
 * @param {string} options.baseFolder - The base folder to calculate relative paths from (default: folderPath)
 * @param {Object} dependencies - Dependencies for testing (optional)
 * @return {Promise<Object>} Upload results with summary
 */
export async function uploadFolder(folderPath, uploadUrl, authToken, options = {}, dependencies = defaultDependencies) {
  const {
    fileExtensions = ['.html', '.htm'],
    baseFolder = folderPath, // Default to folderPath if not provided
  } = options;

  const { chalk: chalkDep } = dependencies;
  const getFiles = dependencies.getAllHtmlFiles || getAllHtmlFiles;

  try {
    // Validate folder exists
    // Get all files recursively
    let allFiles = getFiles(folderPath, { fileExtensions }, dependencies);
    
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
