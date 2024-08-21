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

import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {importCommand} from './cmd/import.js';
import {rulesCommand} from './cmd/rules.js';
import {bundleCommand} from './cmd/bundle.js';

const argv = yargs(hideBin(process.argv));

importCommand(argv);
rulesCommand(argv);
bundleCommand(argv);

argv
  .scriptName("aem-import-helper")
  .usage('$0 <cmd> [args]')
  .strictCommands()
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .argv;
