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

    // Check if the server explicitly returns 401 or 403
    if (response.status === 401 || response.status === 403) {
      console.error('Unauthorized: Invalid credentials');
      return false;
    }

    // Check the response body for specific errors
    const text = await response.text();
    if (text.includes('Invalid login') || text.includes('Unauthorized')) {
      console.error('Invalid credentials detected in response body');
      return false;
    }

    return response.status === 200;
  } catch (error) {
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
async function validateFiles(imageMappingFile, contentPackagePath) {
  if (!contentPackagePath || !imageMappingFile) {
    return false;
  }

  if (!fs.existsSync(contentPackagePath)) {
    console.error(`Content package not found: ${contentPackagePath}`);
    return false;
  }

  if (!fs.existsSync(imageMappingFile)) {
    console.error(`image-mapping.json file not found: ${imageMappingFile}`);
    return false;
  }
  return true;
}

// Use inquirer to get required upload inputs
async function getUserInputs() {
  return inquirer.prompt([
    { name: 'contentPackagePath', message: 'Enter the absolute path to the content package:' },
    { name: 'imageMappingFile', message: 'Enter the absolute path to the image-mapping.json file:' },
  ]);
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
            const credentials = await getUserCredentials();
            console.log('Validating credentials...');
            if (!validateLogin(argv.aemurl, credentials.username, credentials.password)) {
              console.log(chalk.red('Invalid credentials or AEM URL.'));
              process.exit(1);
            }

            console.log('Saving credentials...');
            saveCredentials(argv.aemurl, credentials.username, credentials.password);
            console.log(chalk.green('Login successful! Credentials saved securely.'));
            process.exit(0);
          },
        })
        .command({
          command: 'upload',
          describe: 'Upload content to AEM Cloud Service environment',
          builder: (yargs) => yargs,
          handler: async () => {
            console.log('Checking for credentials...');
            const credentials = loadCredentials();
            if (!credentials) {
              console.log(chalk.red('No credentials found. Run `aem login` first.'));
              process.exit(1);
            }

            const userInputs = await getUserInputs();

            console.log('Checking for files...');

            if (!validateFiles(userInputs.imageMappingFile, userInputs.contentPackagePath)) {
              console.log(chalk.green('Invalid file paths provided.'));
              process.exit(1);
            }

            const opts = {
              username: credentials.username,
              password: credentials.password,
              targetAEMUrl: credentials.url,
              maxRetries: 3,
            };

            // Process the upload request
            uploadImagesToAEM(opts, userInputs.imageMappingFile)
              .then(() => uploadPackageToAEM(opts, userInputs.contentPackagePath))
              .then(() => console.log(chalk.green('Upload completed successfully')))
              .then(() => process.exit(0))
              .catch((err) => {
                console.error(chalk.red('Error during upload:', err.message));
                process.exit(1);
              });
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
