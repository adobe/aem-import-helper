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
import chalk from 'chalk';
import { runImportJobAndPoll } from '../import/import-helper.js';
import { checkEnvironment } from '../utils/env-utils.js';

export function importCommand(yargs) {
  yargs.command({
    command: 'import',
    describe: 'Start an import job',
    builder: (yargs) => {
      return yargs
        .option('urls', {
          describe: 'path to urls file',
          type: 'string',
          demandOption: true,
        })
        .option('options', {
          describe: 'options as a JSON string',
          type: 'string',
        })
        .option('importjs', {
          describe: 'path to import script',
          type: 'string',
        })
        .option('models', {
          describe: 'path to component-models.json file',
          type: 'string',
        })
        .option('filters', {
          describe: 'path to component-filters.json file',
          type: 'string',
        })
        .option('definitions', {
          describe: 'path to component-definition.json file',
          type: 'string',
        })
        .option('sharepointurl', {
          describe: 'SharePoint URL to upload imported files to',
          type: 'string',
        })
        .option('stage', {
          describe: 'use stage endpoint',
          type: 'boolean',
        });
    },
    handler: async (argv) => {
      const {
        urls: urlsPath,
        options: optionsString,
        importjs: importJsPath,
        models: modelsPath,
        filters: filtersPath,
        definitions: definitionsPath,
        sharepointurl: sharePointUploadUrl,
        stage,
      } = argv;

      checkEnvironment(process.env);

      // Read URLs from the file
      const urls = fs.readFileSync(urlsPath, 'utf8').split('\n').filter(Boolean);

      // Parse the options object
      let options;
      if (optionsString) {
        try {
          options = JSON.parse(optionsString);
        } catch (error) {
          console.error(chalk.red('Error: Invalid options JSON.'));
          process.exit(1);
        }
      }

      // Run the import job
      try {
        await runImportJobAndPoll({ urls, options, importJsPath, sharePointUploadUrl, stage, modelsPath, filtersPath, definitionsPath } );
        console.log(chalk.green('Done.'));
      } catch(error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      };
    },
  });
}
