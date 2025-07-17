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
import { processPages } from './da-helper.js';

// DA API base URL
const DA_BASE_URL = 'https://admin.da.live';
const DA_CONTENT_URL = 'https://content.da.live';

/**
 * Validate the existence of the asset-list.json and HTML folder.
 * @param {string} assetListFile - The path to the asset-list.json file
 * @param {string} daFolder - The path to the HTML folder
 * @return {boolean} True if the files exist, false otherwise
 */
function validateFiles(assetListFile, daFolder) {
  // Check if asset list file exists and is a file
  if (!fs.existsSync(assetListFile) || !fs.statSync(assetListFile).isFile()) {
    console.error(chalk.red(`asset-list.json file not found: ${assetListFile}`));
    return false;
  }

  // Check if DA folder exists and is a directory
  if (!fs.existsSync(daFolder) || !fs.statSync(daFolder).isDirectory()) {
    console.error(chalk.red(`DA folder not found or not a directory: ${daFolder}`));
    return false;
  }
  return true;
}

/**
 * Validate access to the DA site by making a HEAD request to the target environment.
 * @param {string} listUrl - The DA list URL constructed from org and site (e.g., https://admin.da.live/list/geometrixx/outdoors)
 * @param {string} token - The DA authentication token (optional)
 * @return {Promise<Object>} Object with success status and whether token is required
 */
async function validateAccess(listUrl, token = null) {
  try {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch(listUrl, { method: 'HEAD', headers });

    if (response.ok) {
      return { success: true, tokenRequired: false };
    }

    // If we get 401/403 without a token, the site requires authentication
    if ((response.status === 401 || response.status === 403) && !token) {
      console.error(chalk.red(`Site requires authentication. Status: ${response.status} - ${response.statusText}`));
      return { success: false, tokenRequired: true };
    }

    // If we get 401/403 with a token, the token is invalid
    if ((response.status === 401 || response.status === 403) && token) {
      console.error(chalk.red(`Login failed with status: ${response.status} - ${response.statusText}`));
      console.error(chalk.red('Unauthorized: Invalid token'));
      return { success: false, tokenRequired: false };
    }

    // Other errors
    console.error(chalk.red(`Access failed with status: ${response.status} - ${response.statusText}`));
    return { success: false, tokenRequired: false };
  } catch (error) {
    console.error(chalk.red(`Network error: ${error.message}`));
    return { success: false, tokenRequired: false };
  }
}

export const daBuilder = (yargs) => {
  return yargs
    .option('org', {
      type: 'string',
      describe: 'The organization',
      demandOption: true,
    })
    .option('site', {
      type: 'string',
      describe: 'The name of the site.',
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
    .option('output', {
      type: 'string',
      describe: 'Absolute path to the output folder where the DA content (pages, assets, etc.) will be stored',
      default: 'da-content',
    })
    .option('token', {
      describe: 'Path to a file containing the DA authentication token or the token value',
      type: 'string',
      demandOption: false,
    });
}

export const daHandler = async (args) => {
  if (!validateFiles(args['asset-list'], args['da-folder'])) {
    process.exit(1);
  }

  // Construct the DA URL from org and site
  const daLocation = `${DA_BASE_URL}/source/${args.org}/${args.site}`;
  const daImageLocation = `${DA_CONTENT_URL}/${args.org}/${args.site}`;
  const listUrl = `${DA_BASE_URL}/list/${args.org}/${args.site}`;

  // Handle token (optional)
  let token = args.token;
  
  if (token) {
    // Check if it's a file path (exists as a file)
    if (fs.existsSync(token) && fs.statSync(token).isFile()) {
      token = fs.readFileSync(token, 'utf-8').trim();
    }
  }

  console.log(chalk.yellow('Validating site access...'));
  const validation = await validateAccess(listUrl, token);
  
  if (!validation.success) {
    if (validation.tokenRequired) {
      console.error(chalk.red('This site requires authentication. Please re-run the command with a valid IMS token.'));
      console.error(chalk.yellow('Example: --token "your-token-here" or --token "/path/to/token-file"'));
    }
    process.exit(1);
  }

  if (token) {
    console.log(chalk.green('Token validation successful.'));
  } else {
    console.log(chalk.green('Site accessible without authentication.'));
  }

  try {
    // Read and parse the asset list JSON file
    const assetListJson = JSON.parse(fs.readFileSync(args['asset-list'], 'utf-8'));
    
    // Extract the assets array from the JSON structure
    const assetUrls = new Set(assetListJson.assets || []);
    
    if (assetUrls.size === 0) {
      console.warn(chalk.yellow('No asset urls found in the asset-list file. Expected format: {"assets": ["url1", "url2", ...]}'));
    }
    
    await processPages(daLocation, daImageLocation, assetUrls, args['da-folder'], args['output'], token);

  } catch (err) {
    console.error(chalk.red('Error during processing:', err));
    process.exit(1);
  }
  console.log(chalk.green('Assets processed and uploaded successfully.'));
  process.exit(0);
}
