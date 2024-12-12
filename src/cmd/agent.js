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
import { runMappingAgent } from '../assistant/agent-helper.js';

function logAgentError(error) {
  console.error(chalk.red(`\n\nAgent Error: ${error.message}`));
  process.exit(1);
}

export function agentCommand(yargs) {
  yargs.command({
    command: 'agent',
    describe: 'Agent for orchestrating import script generation.',
    builder: (yargs) => {
      return yargs
        .option('outputPath', {
          describe: 'Output path for generated scripts',
          type: 'string',
        })
        .option('stage', {
          describe: 'use stage endpoint',
          type: 'boolean',
        })
        .command({
          command: 'mapping',
          describe: 'Converts section mapping.',
          builder: (yargs) => {
            return yargs
              .option('mappingPath', {
                describe: 'Path to the section mapping file',
                type: 'string',
                demandOption: true,
              });
          },
          handler: async (argv) => {
            try {
              await runMappingAgent({
                mappingPath: argv.mappingPath,
                outputPath: argv.outputPath,
                stage: argv.stage,
              });
              process.exit(0);
            } catch (error) {
              logAgentError(error);
            }
          },
        });
    },
  });
}
