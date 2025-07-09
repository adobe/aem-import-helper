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
import chalk from 'chalk';
import fetch from 'node-fetch';
import { uploadFolder } from './upload.js';
import { processAndUpdateHTMLPages } from './da-helper.js';

// DA API base URL
const DA_BASE_URL = 'https://admin.da.live';

/**
 * Validate the existence of the asset-list.json and HTML folder.
 * @param {string} assetListFile - The path to the asset-list.json file
 * @param {string} htmlFolder - The path to the HTML folder
 * @return {boolean} True if the files exist, false otherwise
 */
function validateFiles(assetListFile, htmlFolder) {
  const files = [
    { path: assetListFile, message: `asset-list.json file not found: ${assetListFile}`, mandatory: true },
    { path: htmlFolder, message: `DA folder not found: ${htmlFolder}`, mandatory: true },
  ];

  for (const file of files) {
    if (file.mandatory === false) {
      continue;
    }

    if (!fs.existsSync(file.path)) {
      console.error(chalk.red(file.message));
      return false;
    }
  }
  return true;
}

/**
 * Validate the DA authentication token by making a HEAD request to the target environment.
 * @param {string} daLocation - The DA target environment
 * @param {string} token - The DA authentication token
 * @return {Promise<boolean>} True if the token is valid, false otherwise
 */
async function validateLogin(listUrl, token) {
  try {
    
    const headers = {
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(listUrl, { method: 'HEAD', headers });

    if (!response.ok) {
      console.error(chalk.red(`Login failed with status: ${response.status} - ${response.statusText}`));
      if (response.status === 401 || response.status === 403) {
        console.error(chalk.red('Unauthorized: Invalid token'));
      }
      return false;
    }

    const text = await response.text();
    if (text.includes('Invalid token') || text.includes('Unauthorized')) {
      console.error(chalk.red(`Invalid token detected in response body: ${text}`));
      return false;
    }

    return response.status === 200;
  } catch (error) {
    console.error(chalk.red(`Network error: ${error.message}`));
    return false;
  }
}

export const daBuilder = (yargs) => {
  return yargs
    .option('org', {
      type: 'string',
      describe: 'The organization',
      demandOption: true,
    })
    .option('repo', {
      type: 'string',
      describe: 'Name of the repository',
      demandOption: true,
    })
    .option('asset-list', {
      type: 'string',
      describe: 'Absolute path to the asset-list.json file',
      demandOption: true,
    })
    .option('da-folder', {
      type: 'string',
      describe: 'Absolute path to the DA folder',
      demandOption: true,
    })
    .option('download-folder', {
      type: 'string',
      describe: 'Path to the download folder',
      default: 'da-assets',
    })
    .option('auth-token', {
      describe: 'DA authentication token or path to a file containing the token',
      type: 'string',
      demandOption: true,
    });
}

export const daHandler = async (args) => {
  if (!validateFiles(args['asset-list'], args['da-folder'])) {
    process.exit(1);
  }

  // Construct the DA URL from org and repo
  const daLocation = `${DA_BASE_URL}/source/${args.org}/${args.repo}`;
  const listUrl = `${DA_BASE_URL}/list/${args.org}/${args.repo}`;

  // check to see if the token is a string value or a file
  let token = args.token;
  if (fs.existsSync(token)) {
    token = fs.readFileSync(token, 'utf-8').trim();
  }

  console.log(chalk.yellow('Validating token...'));
  if (!await validateLogin(listUrl, token)) {
    process.exit(1);
  }

  try {
    // Read and parse the asset list JSON file
    const assetListJson = JSON.parse(fs.readFileSync(args['asset-list'], 'utf-8'));
    
    // Extract the assets array from the JSON structure
    const assetUrls = new Set(assetListJson.assets || []);
    
    if (!Array.isArray(assetListJson.assets) || assetListJson.assets.length === 0) {
      console.warn(chalk.red('No assets found in the asset-list file. Expected format: {"assets": ["url1", "url2", ...]}'));
    }
    
    console.log(chalk.blue(`Found ${assetUrls.size} assets in the asset list`));
    
    await processAndUpdateHTMLPages(daLocation, assetUrls, args['da-folder'], args['download-folder']);

    console.log(chalk.yellow(`Uploading assets to ${daLocation}...`));
    await uploadFolder(args['download-folder'], daLocation, token, {
      fileExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
      excludePatterns: ['node_modules', '.git'],
      verbose: true,
    });

    console.log(chalk.yellow('Processing HTML folder...'));
    await uploadFolder(args['da-folder'], daLocation, token, {
      fileExtensions: ['.html'],
      verbose: true,
    });

  } catch (err) {
    console.error(chalk.red('Error during processing:', err));
    process.exit(1);
  }
  console.log(chalk.green('Assets processed and uploaded successfully.'));
  process.exit(0);
}
