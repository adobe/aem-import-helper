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

import chalk from 'chalk';
import unzipper from 'unzipper';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';

// Temporary directory to store the extracted files
const downloadDirDefault = `extracted-files-${Date.now()}`;

async function downloadAndExtractZip(s3PresignedUrl, downloadDir) {
  try {
    // Download the ZIP file using fetch
    const response = await fetch(s3PresignedUrl);

    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.statusText}`);
    }

    // Extract the ZIP file to the provided directory
    await Readable.fromWeb(response.body).pipe(unzipper.Extract({ path: downloadDir })).promise();
    console.log('Download and extraction complete.');
  } catch (error) {
    console.error('Error downloading or extracting the ZIP:', error);
    throw error;
  }
}

function parseSharePointFolderPath(sharepointUrl) {
  // Parse the URL
  const urlObj = new URL(sharepointUrl);

  // Extract the pathname (everything after the domain)
  const fullPath = urlObj.pathname;

  // Remove the "/:f:/r" part, which is specific to this type of SharePoint URL
  const cleanedPath = fullPath.replace(/^\/:f:\/r/, '');

  // The expected SharePoint folder path format should not have URL-encoded characters (like %20 for spaces)
  const decodedPath = decodeURIComponent(cleanedPath);

  return decodedPath;
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
  const cleanedPath = path.replace(/^\/:f:\/r/, '');

  // Return the site URL and path as an object
  return {
    siteUrl,
    basePath: cleanedPath
  };
}

export async function uploadZipFromS3ToSharePoint(s3PresignedUrl, sharePointUrl) {

  async function uploadFileToSharePoint(filePath, relativeFolder) {
    try {
      const fileName = path.basename(filePath);
      const { siteUrl, basePath } = parseSharePointUrl(sharePointUrl);
      const command = `m365 spo file add --webUrl ${siteUrl} --folder "${basePath}/${relativeFolder}" --path "${filePath}" --overwrite`;

      // Execute the m365 CLI command to upload the file
      console.log(command);
      //execSync(command, { stdio: 'inherit' });

      console.log(`File uploaded: ${fileName} to ${relativeFolder}`);
    } catch (error) {
      console.error('Error uploading file to SharePoint:', error);
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
  console.log(chalk.green('Downloading job archive...'));

  try {
    // Step 1: Download and extract the ZIP file
    await downloadAndExtractZip(s3PresignedUrl, downloadDirDefault);

    // Step 2: Upload files to SharePoint, preserving the directory structure
    await uploadDirectoryToSharePoint(path.join(downloadDirDefault, 'docx'));

    console.log('All files uploaded to SharePoint.');
  } catch (error) {
    console.error('Error processing ZIP from S3:', error);
  }

}
