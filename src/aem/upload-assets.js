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
import { FileSystemUploadOptions, FileSystemUpload } from '@adobe/aem-upload';
import chalk from 'chalk';

/**
 * Build the AEM Assets URL to which the assets need to be uploaded.
 *
 * @param targetUrl - The URL of the AEM Assets instance
 * @returns {string} The URL to which the assets need to be uploaded
 */
function buildAEMUrl(targetUrl) {
  let aemUrl = targetUrl;
  // Ensure the URL starts with http:// or https://
  if (!/^https?:\/\//i.test(aemUrl)) {
    aemUrl = `https://${aemUrl}`;
  }

  // Strip any trailing `/` from the aem url
  aemUrl = aemUrl.replace(/\/+$/, '');

  // Append `/content/dam`
  return new URL('/content/dam', aemUrl).toString();
}


/**
 * Build the FileSystemUploadOptions for uploading assets to AEM.
 * @param {string} target - The URL of the AEM Assets instance
 * @param {string} token - The bearer token for authentication
 * @returns {DirectBinaryUploadOptions}
 */
function buildFileSystemUploadOptions(target, token) {
  return new FileSystemUploadOptions()
    .withUrl(buildAEMUrl(target))
    .withConcurrent(true)
    .withMaxConcurrent(10)
    .withHttpRetryDelay(5000) // retry delay in milliseconds; default retry count = 3
    .withDeepUpload(true) // include all descendent folders and files
    .withHttpOptions({
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    // If 'true', and an asset with the given name already exists, the process will delete the existing
    // asset and create a new one with the same name and the new binary.
    .withUploadFileOptions({ replace: true });
}


/**
 * Create a file uploader to upload assets. Attach event listeners to handle file upload events.
 *
 * @returns {FileSystemUpload} The file uploader
 */
function createFileUploader() {
  const fileUpload = new FileSystemUpload();

  // specific handling that should occur when a file finishes uploading successfully
  fileUpload.on('fileend', (data) => {
    const { fileName } = data;
    console.info(chalk.yellow(`Uploaded asset: ${fileName}`));
  });

  // specific handling that should occur when a file upload fails
  fileUpload.on('fileerror', (data) => {
    const { fileName, errors } = data;
    console.error(chalk.red(`Failed to upload asset: ${fileName}. ${errors.toString()}`));
  });

  return fileUpload;
}

export async function uploadAssets(target, token, assetFolder) {
  const fileUpload = createFileUploader();
  const options = buildFileSystemUploadOptions(target, token);
  return await fileUpload.upload(options, [assetFolder]);
}
