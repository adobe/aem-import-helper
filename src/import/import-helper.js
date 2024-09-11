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

/**
 * Run the import job and begin polling for the result. Logs progress & result to the console.
 * @param {Array<string>} urls - Array of URLs to import
 * @param {object} options - Optional object with import options
 * @param {string} importJsPath - Optional path to the custom import.js file
 * @param {boolean} stage - Set to true if stage APIs should be used
 * @returns {Promise<void>}
 */
async function runImportJobAndPoll( {
  urls,
  importJsPath,
  options,
  stage = false
} ) {
  // Determine the base URL
  const baseURL = stage
    ? 'https://spacecat.experiencecloud.live/api/ci/tools/import/jobs'
    : 'https://spacecat.experiencecloud.live/api/v1/tools/import/jobs';

  // Function to make HTTP requests
  async function makeRequest(url, method, data) {
    const parsedUrl = new URL(url);
    const headers = new Headers({
      'Content-Type': data ? 'application/json' : '',
      'x-api-key': process.env.AEM_IMPORT_API_KEY,
    });
    if (data instanceof FormData) {
      headers.delete('Content-Type');
    }
    const res = await fetch(parsedUrl, {
      method,
      headers,
      body: data,
    });
    if (res.ok) {
      return res.json();
    }
    const body = await res.text();
    throw new Error(`Request failed with status code ${res.status}. `
        + `x-error header: ${res.headers.get('x-error')}, x-invocation-id: ${res.headers.get('x-invocation-id')}, `
        + `Body: ${body}`);
  }

  // Function to poll job status
  async function pollJobStatus(jobId) {
    const url = `${baseURL}/${jobId}`;
    while (true) {
      try {
        const jobStatus = await makeRequest(url, 'GET');
        if (jobStatus.status !== 'RUNNING') {
          console.log(chalk.green('Job completed:'), jobStatus);

          // Print the job result's downloadUrl
          const jobResult = await makeRequest(`${url}/result`, 'POST');
          console.log(chalk.green('Download the import archive:'), jobResult.downloadUrl);
          break;
        }
        console.log(chalk.yellow('Job status:'), jobStatus.status);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before polling again
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

  return startJob();
}

export default runImportJobAndPoll;
