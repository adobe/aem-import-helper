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

import {
  runRemovalAssistant,
  runBlockAssistant,
  runStartAssistant,
  runCellAssistant,
} from '../assistant/assistant-helper.js';
import chalk from 'chalk';

export function assistantCommand(yargs) {
  yargs.command({
    command: 'assistant',
    describe: 'Assists with creating import script rules.',
    builder: (yargs) => {
      return yargs
      .option('url', {
        describe: 'URL of the document',
        type: 'string',
        demandOption: true
      })
      .option('outputPath', {
        describe: 'Output path for generated scripts',
        type: 'string',
      })
      .command({
        command: 'start',
        describe: 'Start a new import project.',
        handler: async (argv) => {
          try {
            await runStartAssistant({
              url: argv.url,
              outputPath: argv.outputPath
            });
            process.exit(0);
          } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
          }
        }
      })
      .command({
        command: 'cleanup',
        describe: 'Add elements that can be removed from the document.',
        builder: (yargs) => {
          return yargs
          .option('prompt', {
            describe: 'Prompt for elements to remove',
            type: 'string',
            demandOption: true
          });
        },
        handler: async (argv) => {
          try {
            await runRemovalAssistant({
              url: argv.url,
              prompt: argv.prompt,
              outputPath: argv.outputPath
            });
          process.exit(0);
          } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
          }
        }
      })
      .command({
        command: 'block',
        describe: 'Builds the transformation rules for page blocks.',
        builder: (yargs) => {
          return yargs
          .option('name', {
            describe: 'The name of the block',
            type: 'string',
            demandOption: true
          })
          .option('prompt', {
            describe: 'Prompt for block to find',
            type: 'string',
            demandOption: true
          });
        },
        handler: async (argv) => {
          try {
            await runBlockAssistant({
              url: argv.url,
              name: argv.name,
              prompt: argv.prompt,
              outputPath: argv.outputPath
            });
          process.exit(0);
          } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
          }
        }
      })
      .command({
        command: 'cells',
        describe: 'Builds the cell rules for a block.',
        builder: (yargs) => {
          return yargs
          .option('name', {
            describe: 'The name of the block',
            type: 'string',
            demandOption: true
          })
          .option('prompt', {
            describe: 'Prompt for cells to include',
            type: 'string',
            demandOption: true
          });
        },
        handler: async (argv) => {
          try {
            await runCellAssistant({
              url: argv.url,
              name: argv.name,
              prompt: argv.prompt,
              outputPath: argv.outputPath
            });
            process.exit(0);
          } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
          }
        }
      });
    }
  });
}
