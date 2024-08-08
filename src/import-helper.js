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

const https = require('https');
const { URL } = require('url');
const prepareImportScript = require("./bundler");

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
  options, importJsBundle,
  stage = false
} ) {
  // Determine the base URL
  const baseURL = stage
    ? 'https://spacecat.experiencecloud.live/api/ci/tools/import/jobs'
    : 'https://spacecat.experiencecloud.live/api/v1/tools/import/jobs';

  // Function to make HTTP requests
  function makeRequest(url, method, data) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const requestOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method,
        headers: {
          'Content-Type': data ? 'application/json' : '',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          'x-api-key': process.env.SPACECAT_API_KEY,
          'x-import-api-key': process.env.IMPORT_API_KEY,
        }
      };

      const req = https.request(requestOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Request failed with status code ${res.statusCode}. x-error header: ${res.headers['x-error']}, Body: ${body}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      if (data) {
        req.write(data);
      }

      req.end();
    });
  }

  // Function to poll job status
  async function pollJobStatus(jobId) {
    const url = `${baseURL}/${jobId}`;
    while (true) {
      try {
        const jobStatus = await makeRequest(url, 'GET');
        if (jobStatus.status !== 'RUNNING') {
          console.log('Job completed:', jobStatus);

          // Print the job result's downloadUrl
          const jobResult = await makeRequest(`${url}/result`, 'POST');
          console.log(`Download the import archive: ${jobResult.downloadUrl}`);
          break;
        }
        console.log('Job status:', jobStatus.status);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before polling again
      } catch (error) {
        console.error('Error polling job status:', error);
        break;
      }
    }
  }

  // Main function to start the job
  async function startJob() {
    const requestBody = {
      urls,
    };

    if (options) {
      // Conditionally include options, when provided
      requestBody.options = options;
    }

    if (importJsPath) {
      // Conditionally include the custom (bundled) import.js, when provided
      requestBody.importScript = prepareImportScript(importJsPath);
    }

    try {
      const jobResponse = await makeRequest(baseURL, 'POST', JSON.stringify(requestBody));
      console.log('Job started:', jobResponse);
      await pollJobStatus(jobResponse.id);
    } catch (error) {
      console.error('Error starting job:', error);
    }
  }

  return startJob();
}

module.exports = runImportJobAndPoll;
