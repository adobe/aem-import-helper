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

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

// Parse command-line arguments
const args = process.argv.slice(2);
let urlsPath = '';
let optionsString = '';
let stage = false;

args.forEach((arg, index) => {
  if (arg === '--urls' && args[index + 1]) {
    urlsPath = args[index + 1];
  } else if (arg === '--options' && args[index + 1]) {
    optionsString = args[index + 1];
  } else if (arg === '--stage') {
    stage = true;
  }
});

// Ensure required arguments are provided and environment variables are set
if (!urlsPath) {
  console.error('Usage: node import-helper.js --urls <path/to/urls.txt> [--options <options>] [--stage]');
  process.exit(1);
}

if (!process.env.SPACECAT_API_KEY || !process.env.IMPORT_API_KEY) {
  console.error('Error: Ensure the SPACECAT_API_KEY and IMPORT_API_KEY environment variables are set.');
  process.exit(1);
}

// Read URLs from the file
const urls = fs.readFileSync(urlsPath, 'utf8').split('\n').filter(Boolean);

// Parse the options object
let options;
if (optionsString) {
  try {
    options = JSON.parse(optionsString);
  } catch (error) {
    console.error('Error: Invalid options JSON.');
    process.exit(1);
  }
}

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
  const requestBody = JSON.stringify({
    urls,
    ...(options ? { options } : {}) // Conditionally include options, if provided
  });

  try {
    const jobResponse = await makeRequest(baseURL, 'POST', requestBody);
    console.log('Job started:', jobResponse);
    await pollJobStatus(jobResponse.id);
  } catch (error) {
    console.error('Error starting job:', error);
  }
}

startJob();
