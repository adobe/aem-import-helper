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
import fs from 'fs';
import fetch from 'node-fetch';
import inquirer from 'inquirer';
import uploadPackageToAEM from '../aem/uploadPackage.js';
import uploadImagesToAEM from '../aem/uploadImages.js';
import { loadCredentials, saveCredentials } from '../utils/credential-utils.js';

// Validate credentials with AEM
async function validateLogin(url, username, password) {
  try {
    const headers = {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      console.error(chalk.red(`Login failed with status: ${response.status} - ${response.statusText}`));
      // Check if the server explicitly returns 401 or 403
      if (response.status === 401 || response.status === 403) {
        console.error(chalk.red('Unauthorized: Invalid credentials'));
      }
      return false;
    }

    // Check the response body for specific errors
    const text = await response.text();
    if (text.includes('Invalid login') || text.includes('Unauthorized')) {
      console.error(chalk.red(`Invalid credentials detected in response body: ${text}`));
      return false;
    }

    return response.status === 200;
  } catch (error) {
    console.error(chalk.red(`Network error: ${error.message}`));
    return false;
  }
}

// Use inquirer to get user credentials
async function getUserCredentials() {
  const answers = await inquirer.prompt([
    { name: 'username', message: 'Enter your AEM username:' },
    { name: 'password', message: 'Enter your AEM password:', type: 'password' },
  ]);

  return answers;
}

// Validate the files
function validateFiles(assetMappingFile, contentPackagePath) {
  if (!fs.existsSync(contentPackagePath)) {
    console.error(chalk.red(`Content package not found: ${contentPackagePath}`));
    return false;
  }

  if (!fs.existsSync(assetMappingFile)) {
    console.error(chalk.red(`image-mapping.json file not found: ${assetMappingFile}`));
    return false;
  }
  return true;
}

// Get, validate and store the user login credentials
async function login(argv) {
  const credentials = await getUserCredentials();
  console.log(chalk.yellow('Validating credentials...'));
  if (!await validateLogin(argv.aemurl, credentials.username, credentials.password)) {
    process.exit(1);
  }
  console.log(chalk.yellow('Saving credentials...'));
  saveCredentials(argv.aemurl, credentials.username, credentials.password);
  console.log(chalk.green('Login successful! Credentials saved securely.'));
}

// Perform the upload of content to AEM
async function runUpload(opts) {
  console.log(chalk.yellow('Uploading content to AEM...'));
  await uploadImagesToAEM(opts);
  await uploadPackageToAEM(opts);
  console.log(chalk.green('Content uploaded successfully.'));
}

export function aemCommand(yargs) {
  yargs.command({
    command: 'aem <subcommand>',
    describe: 'Manage AEM Cloud Service interactions',
    builder: (yargs) => {
      return yargs
        .command({
          command: 'login',
          describe: 'Login to AEM Cloud Service environment',
          builder: (yargs) => {
            return yargs.option('aemurl', {
              describe: 'AEM Cloud Service URL to upload content to',
              type: 'string',
              demandOption: true,
            });
          },
          handler: async (argv) => {
            await login(argv);
            process.exit(0);
          },
        })
        .command({
          command: 'upload',
          describe: 'Upload content to AEM Cloud Service environment',
          builder: (yargs) => {
            return yargs
              .option('zip', {
                type: 'string',
                describe: 'Absolute path to the content package ZIP file',
                demandOption: true,
              })
              .option('asset-mapping', {
                type: 'string',
                describe: 'Absolute path to the image-mapping.json file',
                demandOption: true,
              })
          },
          handler: async (args) => {
            console.log(chalk.yellow('Checking for credentials...'));
            const credentials = loadCredentials();
            if (!credentials) {
              console.log(chalk.red('No credentials found. Run `aem login` first.'));
              process.exit(1);
            }

            console.log(chalk.yellow('Checking for files...'));
            if (!validateFiles(args['asset-mapping'], args['zip'])) {
              process.exit(1);
            }

            const opts = {
              username: credentials.username,
              password: credentials.password,
              targetAEMUrl: credentials.url,
              maxRetries: 3,
              imageMappingFilePath: args['asset-mapping'],
              packagePath: args['zip'],
            };

            try {
              await runUpload(opts);
              process.exit(0)
            } catch (err) {
              console.error(chalk.red('Error during upload:', err.message));
              process.exit(1);
            }

          },
        })
        .demandCommand(1, 'You need to specify a valid subcommand: `login` or `upload`');
    },
    handler: () => {
      // Default handler if no valid subcommand is provided
      console.log(chalk.red('Invalid subcommand. Use `aem login` or `aem upload`.'));
      process.exit(1);
    },
  });
}
