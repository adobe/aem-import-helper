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

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import unzipper from 'unzipper';
import chalk from 'chalk';

// Maximum number of times to try uploading a file to SharePoint
const UPLOAD_RETRY_LIMIT = 2;

// Temporary directory to store the extracted files
const downloadDirDefault = `extracted-files-${Date.now()}`;

/**
 * Download a ZIP file from a given S3 presigned URL and extract it to a directory.
 * @param {string} s3PresignedUrl - The S3 presigned URL to download the ZIP file from
 * @param {string} downloadDirPath - The directory to extract the ZIP file to
 * @returns {Promise<void>}
 */
async function downloadAndExtractZip(s3PresignedUrl, downloadDirPath) {
  console.log(chalk.green('Downloading job archive...'));
  try {
    // Download the ZIP file using fetch
    const response = await fetch(s3PresignedUrl);

    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.statusText}`);
    }

    // Stream the ZIP file to the unzipper, writing its contents to the download directory
    await Readable.fromWeb(response.body).pipe(unzipper.Extract({ path: downloadDirPath })).promise();
    console.log(chalk.green('Download and extraction complete.'));
  } catch (error) {
    console.error('Error downloading or extracting the ZIP:', error);
    throw error;
  }
}

function parseSharePointUrl(sharepointUrl) {
  // Parse the URL using the URL object
  const urlObj = new URL(sharepointUrl);

  // Extract the pathname (everything after the domain)
  const fullPathDecoded = decodeURIComponent(urlObj.pathname);

  // Find the position of "/sites/" and extract the site part
  const siteMatch = fullPathDecoded.match(/\/sites\/[^\/]+/);
  if (!siteMatch) {
    throw new Error('Invalid SharePoint URL: Missing "/sites/" in the URL');
  }

  const siteUrl = `${urlObj.origin}${siteMatch[0]}`;

  // Extract the path after the siteUrl
  const path = fullPathDecoded.replace(siteMatch[0], '');

  // If there is a "/:f:/r" in the path, remove it
  const cleanedPath = path.replace(/^\/:f:\/[r|e]/, '');

  // Return the site URL and path as an object
  return {
    siteUrl,
    basePath: cleanedPath
  };
}

export async function uploadZipFromS3ToSharePoint(s3PresignedUrl, sharePointUrl) {

  const successfulUploads = [];
  const failedUploads = [];

  async function uploadFileToSharePoint(filePath, relativeFolder, retries = 0) {
    const fileName = path.basename(filePath);
    const relativeFilePath = `${relativeFolder}/${fileName}`;

    try {
      const { siteUrl, basePath } = parseSharePointUrl(sharePointUrl);
      // The following command depends on a globally installed m365 CLI
      const command = `m365 spo file add --webUrl ${siteUrl} --folder "${basePath}/${relativeFolder}" --path "${filePath}" --contentType "Document"`;

      // Execute the m365 CLI command to upload the file. It this command exits with a non-zero code, it will throw.
      execSync(command, { stdio: 'inherit' });

      console.log(`File uploaded: ${relativeFilePath}`);
      successfulUploads.push(relativeFilePath);
    } catch (error) {
      console.warn(chalk.yellow(`Error uploading ${relativeFilePath} to SharePoint:`), error);
      // Retry if we have not reached the attempt limit
      if (retries < UPLOAD_RETRY_LIMIT) {
        const retryAttempt = retries + 1;
        console.log(chalk.yellow(`Retry ${retryAttempt} of ${UPLOAD_RETRY_LIMIT}...`));
        await uploadFileToSharePoint(filePath, relativeFolder, retryAttempt);
      } else {
        console.error(chalk.red(`Failed to upload file: ${relativeFilePath} after ${retries} retries`));
        failedUploads.push(relativeFilePath);
        // Future: if a single file upload fails, should we stop the entire process?
      }
    }
  }

  async function uploadDirectoryToSharePoint(dirPath, rootFolder = '') {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const relativePath = path.join(rootFolder, file);

      if (fs.lstatSync(fullPath).isDirectory()) {
        // Recursively upload files in subdirectories
        await uploadDirectoryToSharePoint(fullPath, relativePath);
      } else {
        // Upload individual file
        await uploadFileToSharePoint(fullPath, rootFolder);
      }
    }
  }

  console.log(chalk.green(`Starting upload to Sharepoint, since you provided a SharePoint URL (${sharePointUrl})`));

  try {
    // Step 1: Download and extract the ZIP file
    await downloadAndExtractZip(s3PresignedUrl, downloadDirDefault);

    // Step 2: Upload files to SharePoint, preserving the directory structure
    await uploadDirectoryToSharePoint(path.join(downloadDirDefault, 'docx'));

    console.log(chalk.green(`SharePoint upload operation complete. Successful uploads: ${successfulUploads.length}, failed uploads: ${failedUploads.length}`));
  } catch (error) {
    console.error('Error during SharePoint upload:', error);
  }
}
