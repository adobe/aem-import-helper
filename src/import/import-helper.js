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
import fetch from 'node-fetch';
import { Blob } from 'buffer';
import { URL } from 'url';
import prepareImportScript from './bundler.js';
import chalk from 'chalk';
import { uploadZipFromS3ToSharePoint } from './sharepoint-uploader.js';
import { makeRequest } from '../utils/http-utils.js';

function getApiBaseUrl(stage) {
  const alias = stage ? 'ci' : 'v1';
  return `https://spacecat.experiencecloud.live/api/${alias}/tools/import/jobs`;
}

async function getJobResult(jobId, stage) {
  return makeRequest(`${getApiBaseUrl(stage)}/${jobId}/result`, 'POST');
}

/**
 * Run the import job and begin polling for the result. Logs progress & result to the console.
 * @param {Array<string>} urls - Array of URLs to import
 * @param {object} options - Optional object with import options
 * @param {string} importJsPath - Optional path to the custom import.js file
 * @param {string} sharePointUploadUrl - SharePoint URL to upload imported files to
 * @param {boolean} stage - Set to true if stage APIs should be used
 * @param {number} pollInterval - Time to wait between polling requests
 * @returns {Promise<void>}
 */
export async function runImportJobAndPoll( {
  urls,
  importJsPath,
  options,
  sharePointUploadUrl,
  stage = false,
  pollInterval = 5000,
} ) {
  // Determine the base URL
  const baseURL = getApiBaseUrl(stage);

  function hasProvidedSharePointUrl() {
    return typeof sharePointUploadUrl === 'string';
  }

  // Function to poll job status
  async function pollJobStatus(jobId) {
    const url = `${baseURL}/${jobId}`;
    while (true) {
      // Wait before polling
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      try {
        const jobStatus = await makeRequest(url, 'GET');
        if (jobStatus.status !== 'RUNNING') {
          // Job is finished!
          console.log(chalk.green('Job completed:'), jobStatus);

          // Print the job result's downloadUrl
          const jobResult = await getJobResult(jobId, stage);
          console.log(chalk.green('Download the import archive:'), jobResult.downloadUrl);

          if (hasProvidedSharePointUrl()) {
            // Upload the import archive to SharePoint
            await uploadZipFromS3ToSharePoint(jobResult.downloadUrl, sharePointUploadUrl);
          }
          break;
        }

        const progressUrl = `${url}/progress`;
        const jobProgress = await makeRequest(progressUrl, 'GET');
        console.log(chalk.yellow('Job status:'), jobStatus.status, jobProgress);
      } catch (error) {
        console.error(chalk.red('Error polling job status:'), error);
        break;
      }
    }
  }

  // Main function to start the job
  async function startJob() {
    const requestBody = new FormData();
    requestBody.append('urls', JSON.stringify(urls));
    const { headers, ...restOptions } = options || {};
    if (restOptions) {
      // Conditionally include options, when provided
      requestBody.append('options', JSON.stringify(restOptions));
    }
    if (headers) {
      // Conditionally include custom headers, when provided
      requestBody.append('customHeaders', JSON.stringify(headers));
    }
    if (importJsPath) {
      // Conditionally include the custom (bundled) import.js, when provided
      const bundledCode = prepareImportScript(importJsPath);
      const bundledScriptBlob = new Blob([bundledCode], { type: 'application/javascript' });
      requestBody.append('importScript', bundledScriptBlob, path.basename(importJsPath));
    }

    try {
      const jobResponse = await makeRequest(baseURL, 'POST', requestBody);
      console.log(chalk.yellow('Job started:'), jobResponse);
      await pollJobStatus(jobResponse.id);
    } catch (error) {
      console.error(chalk.red('Error starting job:'), error);
    }
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('No URLs provided');
  }

  return startJob();
}

/**
 * Upload the result of an import job to SharePoint.
 * @param {string} jobId - ID of the job to upload
 * @param {string} sharePointUploadUrl - SharePoint URL to upload imported files to
 * @param {boolean} stage - Set to true if stage APIs should be used
 * @returns {Promise<void>}
 */
export async function uploadJobResult({ jobId, sharePointUploadUrl, stage = false }) {
  // Fetch the job result
  const jobResult = await getJobResult(jobId, stage);

  // Upload the import archive to SharePoint
  await uploadZipFromS3ToSharePoint(jobResult.downloadUrl, sharePointUploadUrl);
}
