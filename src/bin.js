#!/usr/bin/env node
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
const runImportJobAndPoll = require('./import-helper');

// Parse command-line arguments
const args = process.argv.slice(2);
let urlsPath = '';
let optionsString = '';
let importJsPath = null;
let stage = false;

args.forEach((arg, index) => {
  if (arg === '--urls' && args[index + 1]) {
    urlsPath = args[index + 1];
  } else if (arg === '--options' && args[index + 1]) {
    optionsString = args[index + 1];
  } else if (arg === '--importjs' && args[index + 1]) {
    importJsPath = args[index + 1];
  } else if (arg === '--stage') {
    stage = true;
  }
});

// Ensure required arguments are provided and environment variables are set
if (!urlsPath) {
  console.error('Usage: node import-helper.js --urls <path/to/urls.txt> [--options <options>] [--importjs <path/to/import.js>] [--stage]');
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

// Run the import job
runImportJobAndPoll({ urls, options, importJsPath, stage } )
  .then(() => {
    console.log('Done.');
  }).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
