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
import { aemBuilder, aemHandler } from '../aem/cmd-handler.js';

export function aemCommand(yargs) {
  yargs.command({
    command: 'aem <subcommand>',
    describe: 'Manage AEM Cloud Service interactions',
    builder: (yargs) => {
      return yargs
        .command({
          command: 'upload',
          describe: 'Upload content to AEM Cloud Service environment',
          builder: aemBuilder,
          handler: aemHandler,
        })
        .demandCommand(1, 'You need to specify a valid subcommand: `upload`');
    },
    handler: () => {
      // Default handler if no valid subcommand is provided
      console.log(chalk.red('Invalid subcommand. Use `aem upload`.'));
      process.exit(1);
    },
  });
}
