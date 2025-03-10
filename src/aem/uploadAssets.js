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

import path from 'path';
import fs from 'fs';
import { FileSystemUploadOptions, FileSystemUpload } from '@adobe/aem-upload';
import { downloadAssetsInMarkdown, getAssetUrlMap } from './downloadAssets.js';
import chalk from 'chalk';

function cleanup(downloadLocation) {
  return fs.promises.rm(downloadLocation, { recursive: true, force: true });
}

/**
 * Build the AEM Assets URL to which the assets need to be uploaded.
 *
 * @param targetUrl - The URL of the AEM Assets instance
 * @returns {string} The URL to which the assets need to be uploaded
 */
function buildAEMUrl(targetUrl) {
  let AEMUrl = targetUrl;
  // Ensure the URL starts with http:// or https://
  if (!/^https?:\/\//i.test(AEMUrl)) {
    AEMUrl = `https://${AEMUrl}`;
  }

  // Strip any trailing `/` from the aem url
  AEMUrl = AEMUrl.replace(/\/+$/, '');

  // Append `/content/dam`
  return new URL('/content/dam', AEMUrl).toString();
}

/**
 * Get the encoded credentials for basic authentication.
 *
 * @param user - The AEM username
 * @param password - The AEM password
 * @returns {string} The encoded credentials
 */
function getEncodedCredentials(user, password) {
  return Buffer.from(`${user}:${password}`).toString('base64');
}

/**
 * Build the FileSystemUploadOptions for uploading assets to AEM.
 *
 * @param opts - The options for uploading assets to AEM
 * @returns {DirectBinaryUploadOptions}
 */
function buildFileSystemUploadOptions(opts) {
  const { targetAEMUrl, username, password } = opts;

  return new FileSystemUploadOptions()
    .withUrl(buildAEMUrl(targetAEMUrl))
    .withConcurrent(true)
    .withMaxConcurrent(10)
    .withHttpRetryDelay(5000) // retry delay in milliseconds; default retry count = 3
    .withDeepUpload(true) // include all descendent folders and files
    .withHttpOptions({
      headers: {
        Authorization: `Basic ${getEncodedCredentials(username, password)}`,
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

/**
 * Get the AEM asset folder name from the asset mapping file.
 */
function getAemAssetFolderName(assetMappingFilePath) {
  // Get the asset URL map from the asset mapping file
  const assetUrlMap = getAssetUrlMap(assetMappingFilePath);

  // Look for jcr content path in the asset URL map
  // check all entries in case the value is not present in the first entry due to some reason
  for (const jcrAssetPath of assetUrlMap.values()) {
    if (jcrAssetPath) { // Check if the value is not empty
      const match = jcrAssetPath.match(/^\/content\/dam\/([^/]+)/);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

/**
 * Upload assets from urls in markdown file to AEM.
 *
 * @param opts - The options for uploading assets to AEM
 * @returns {Promise<UploadResult>} The result of the upload operation
 */
export default async function uploadAssetsToAEM(opts) {
  const { assetMappingFilePath } = opts;
  const aemAssetFolderName = getAemAssetFolderName(assetMappingFilePath);
  if (!aemAssetFolderName) {
    throw new Error('No valid AEM asset path found in the JCR asset mapping file.');
  }
  console.log(chalk.yellow(`Uploading assets to AEM asset folder: ${aemAssetFolderName}`));
  const downloadLocation = path.join(process.cwd(), aemAssetFolderName);

  // download assets from the asset mapping file
  await downloadAssetsInMarkdown({ maxRetries: 3, downloadLocation }, assetMappingFilePath);

  // upload all assets in given folder
  const fileUpload = createFileUploader();
  const result = await fileUpload.upload(buildFileSystemUploadOptions(opts), [downloadLocation]);

  // clean up the temporary folder
  await cleanup(downloadLocation)

  return result;
}
