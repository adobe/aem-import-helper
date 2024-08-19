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

import fs from 'fs';
import runImportJobAndPoll from '../import/import-helper.js';

export function importCommand(yargs) {
  yargs.command({
    command: 'import',
    describe: 'Start an import job',
    builder: (yargs) => {
      return yargs
      .option('urls', {
        describe: 'path to urls file',
        type: 'string',
        demandOption: true
      })
      .option('options', {
        describe: 'options as a JSON string',
        type: 'string'
      })
      .option('importjs', {
        describe: 'path to import script',
        type: 'string'
      })
      .option('stage', {
        describe: 'use stage endpoint',
        type: 'boolean'
      });
    },
    handler: (argv) => {
      const {
        urls: urlsPath,
        options: optionsString,
        importjs: importJsPath,
        stage
      } = argv;

      // Ensure required arguments are provided and environment variables are set
      if (!urlsPath) {
        console.error('Usage: node import-helper.js --urls <path/to/urls.txt> [--options <options>] [--importjs <path/to/import.js>] [--stage]');
        process.exit(1);
      }

      if (!process.env.AEM_IMPORT_API_KEY) {
        console.error('Error: Ensure the AEM_IMPORT_API_KEY environment variable is set.');
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
    }
  });
}
