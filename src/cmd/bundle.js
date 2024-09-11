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
import prepareImportScript from '../import/bundler.js';

export function bundleCommand(yargs) {
  yargs.command({
    command: 'bundle',
    describe: 'Bundle an import script',
    builder: (yargs) => {
      return yargs
      .option('importjs', {
        describe: 'path to import script',
        type: 'string',
        demandOption: true
      })
    },
    handler: (argv) => {
      const {
        importjs: importJsPath,
      } = argv;

      try {
        console.log(chalk.yellow(`Bundling ${importJsPath}...`));
        const bundledCode = prepareImportScript(importJsPath);
        const outputPath = `${importJsPath.replace(/\.[^/.]+$/, "")}.bundle.js`;
        console.log(chalk.yellow(`Writing to ${outputPath}...`));
        fs.writeFileSync(outputPath, bundledCode);
        console.log(chalk.green('Done.'));
      } catch (error) {
        console.error(chalk.red('Failed to bundle import script:', error));
        process.exit(1);
      }
    }
  });
}
