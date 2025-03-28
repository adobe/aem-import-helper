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
import { uploadJobResult } from '../import/import-helper.js';
import { checkEnvironment } from '../utils/env-utils.js';

export function uploadCommand(yargs) {
  yargs.command({
    command: 'upload',
    describe: 'Upload the result of an import job',
    builder: (yargs) => {
      return yargs
        .option('jobid', {
          describe: 'ID of the job to upload',
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
        jobid: jobId,
        sharepointurl: sharePointUploadUrl,
        stage,
      } = argv;

      checkEnvironment(process.env);

      // Process the upload request
      try {
        await uploadJobResult({ jobId, sharePointUploadUrl, stage });
        console.log(chalk.green('Done.'));
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    },
  });
}
