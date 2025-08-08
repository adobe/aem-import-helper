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
import path from 'path';
import { cleanup, downloadAssets } from '../utils/download-assets.js';
import { uploadAssets } from './upload-assets.js';
import { installPackage } from './package-helper.js';
import fetch from 'node-fetch';
import { getDamRootFolder } from './aem-util.js';

/**
 * Validate the existence of the asset-mapping.json and content package files.
 * @param {string} assetMappingFile - The path to the asset-mapping.json file
 * @param {string} contentPackagePath - The path to the content package ZIP file
 * @param {boolean} skipAssets - If true, the asset mapping file is not required
 * @return {boolean} True if the files exist, false otherwise
 */
function validateFiles(assetMappingFile, contentPackagePath, skipAssets) {
  const files = [
    { path: contentPackagePath, message: `Content package not found: ${contentPackagePath}`, mandatory: true },
    { path: assetMappingFile, message: `asset-mapping.json file not found: ${assetMappingFile}`, mandatory: !skipAssets },
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
 * Validate the AEM login token by making a HEAD request to the target environment.
 * @param url - The AEM target environment
 * @param token - The AEM login token
 * @return {Promise<boolean>} True if the token is valid, false otherwise
 */
async function validateLogin(url, token) {
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(url, { method: 'HEAD', headers });

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

export const aemBuilder = (yargs) => {
  return yargs
    .option('zip', {
      type: 'string',
      describe: 'Absolute path to the content package ZIP file',
      demandOption: true,
    })
    .option('asset-mapping', {
      type: 'string',
      describe: 'Absolute path to the image-mapping.json file',
    })
    .option('token', {
      describe: 'AEM login token or path to a file containing the token',
      type: 'string',
      demandOption: true,
    })
    .option('target', {
      describe: 'AEM target environment',
      type: 'string',
      demandOption: true,
    })
    .option('output', {
      describe: 'Output directory for downloaded assets',
      type: 'string',
      default: 'aem-assets',
    })
    .option('skip-assets', {
      describe: 'If skip-assets is true, the assets are not downloaded',
      type: 'boolean',
      default: false,
    })
    .option('keep', {
      describe: 'If keep is true, local assets are not deleted after upload',
      type: 'boolean',
      default: false,
    })
    .option('images-to-png', {
      describe: 'Convert downloaded images to PNG and update references to .png (default: true)',
      type: 'boolean',
      default: true,
    });
}

export const aemHandler = async (args) => {
  if (!validateFiles(args['asset-mapping'], args['zip'], args['skip-assets'])) {
    process.exit(1);
  }

  if (!fs.existsSync(args.output)) {
    fs.mkdirSync(args.output);
  }

  // check to see if the token is a string value or a file
  let token = args.token;
  if (fs.existsSync(token)) {
    token = fs.readFileSync(token, 'utf-8').trim();
  }

  console.log(chalk.yellow('Validating token...'));
  if (!await validateLogin(args.target, token)) {
    process.exit(1);
  }

  try {
    if (!args['skip-assets']) {
      const assetMappingJson = JSON.parse(fs.readFileSync(args['asset-mapping'], 'utf-8'));
      const assetMapping = new Map(Object.entries(assetMappingJson));

      const downloadFolder = args.output === 'aem-assets'
        ? path.join(process.cwd(), args.output)
        : args.output;

      console.log(chalk.yellow(`Downloading origin assets to ${downloadFolder}...`));
      const imagesToPng = args['images-to-png'] !== false;
      await downloadAssets(assetMapping, downloadFolder, undefined, undefined, {}, { convertImagesToPng: imagesToPng });

      const assetFolder = path.join(downloadFolder, getDamRootFolder(assetMapping));

      console.log(chalk.yellow(`Uploading downloaded assets to ${args.target}...`));
      await uploadAssets(args.target, token, assetFolder);

      if (!args.keep) {
        await cleanup(downloadFolder);
      }
    }

    console.log(chalk.yellow(`Uploading content package ${args.target}...`));
    await installPackage(args.target, token, args['zip']);
  } catch (err) {
    console.error(chalk.red('Error during upload:', err));
    process.exit(1);
  }
  console.log(chalk.green('Content uploaded successfully.'));
  process.exit(0)
}
