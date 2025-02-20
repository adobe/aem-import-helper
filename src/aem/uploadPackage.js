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
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import chalk from 'chalk';

const BASE_DELAY = 5000; // base delay in milliseconds

/**
 * Creates a form-data payload for the package upload.
 * @param {string} packagePath - The path to the content package file.
 * @returns {FormData} The form-data payload.
 */
function createFormData(packagePath) {
  // Read the file asynchronously using fs/promises
  const fileContent = fs.readFileSync(packagePath);

  // Create a FormData instance
  const formData = new FormData();
  formData.append('cmd', 'upload');
  formData.append('force', 'true');
  formData.append('package', fileContent, packagePath.split('/').pop());

  return formData;
}

/**
 * Uploads the package to AEM.
 * @param {string} uploadUrl - The URL for the package upload.
 * @param {string} authHeader - The authorization header.
 * @param {FormData} formData - The form-data payload.
 * @returns {Promise<Response>} The response from the AEM server.
 */
async function uploadPackage(uploadUrl, authHeader, formData) {
  return fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...formData.getHeaders(), // Include FormData headers
      Authorization: authHeader,
    },
    body: formData,
  });
}

/**
 * Install the package in AEM.
 * @param {string} installUrl - The URL for the package install.
 * @param {string} authHeader - The authorization header.
 * @returns {Promise<Response>} The response from the AEM server.
 */
async function installPackage(installUrl, authHeader) {
  const formData = new FormData();
  formData.append('cmd', 'install');

  return fetch(installUrl, {
    method: 'POST',
    headers: {
      ...formData.getHeaders(), // Include FormData headers
      Authorization: authHeader,
    },
    body: formData,
  });
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
  }
  const responseBody = await response.json();
  if (!responseBody.success) {
    throw new Error(`AEM returned an error: ${JSON.stringify(responseBody)}`);
  }
  return responseBody;
}

/**
 * Uploads the package to AEM with retries.
 * @param {string} endpoint - The URL for the package upload.
 * @param {object} authHeader - The authorization header.
 * @param {number} maxRetries - The maximum number of retries.
 * @returns {Promise<unknown>} The response from the AEM server.
 */
async function uploadPackageWithRetry(endpoint, packagePath, authHeader, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Upload package
      const formData = createFormData(packagePath);
      const uploadResponse = await uploadPackage(endpoint, authHeader, formData);
      const uploadResponseBody = await parseJsonResponse(uploadResponse);
      console.info(chalk.yellow(`Package uploaded successfully to ${uploadResponseBody.path}`));

      return uploadResponseBody;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(chalk.red('Max retries reached. Failed to upload package.', error.message));
        throw error;
      } else {
        const retryDelay = BASE_DELAY * 2 ** (attempt - 1);
        console.warn(chalk.yellow(`Retrying package upload (${attempt}/${maxRetries}) in ${retryDelay}ms...`));
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay);
        });
      }
    }
  }
}

/**
 * Installs the package in AEM with retries.
 * @param {string} endpoint - The URL for the package install.
 * @param {object} authHeader - The authorization header.
 * @param {number} maxRetries - The maximum number of retries.
 * @returns {Promise<unknown>} The response from the AEM server.
 */
async function installPackageWithRetry(endpoint, authHeader, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Install package
      const installResponse = await installPackage(endpoint, authHeader);
      const installResponseBody = await parseJsonResponse(installResponse);
      console.info(chalk.yellow(`Package installed successfully at ${endpoint}.`));
      return installResponseBody;

    } catch (error) {
      if (attempt === maxRetries) {
        console.error(chalk.red('Max retries reached. Failed to install package.'));
        throw error;
      } else {
        const retryDelay = BASE_DELAY * 2 ** (attempt - 1);
        console.warn(chalk.yellow(`Retrying package install (${attempt}/${maxRetries}) in ${retryDelay}ms...`));
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay);
        });
      }
    }
  }
}

/**
 * Uploads a package to AEM using the CRX Package Manager API.
 * @param {*} opts - The options for uploading the package
 * @param {string} packagePath - The path to the content package file path
 * @returns {Promise<unknown>} The response from the AEM server.
 */
export default async function uploadPackageToAEM(opts) {
  const {
    username, password, targetAEMUrl, maxRetries = 3, packagePath,
  } = opts;

  if (!username || !password || !targetAEMUrl || !packagePath) {
    throw new Error('Missing required parameters: username, password, targetAEMUrl, or packagePath');
  }

  const packageName = packagePath.split('/').pop();
  const endpoint = `${targetAEMUrl}/crx/packmgr/service/.json/etc/packages/my_packages/${packageName}`;
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  await uploadPackageWithRetry(endpoint, packagePath, authHeader, maxRetries);
  await installPackageWithRetry(endpoint, authHeader, maxRetries);
}
