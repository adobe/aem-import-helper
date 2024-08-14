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

import {greet} from '../rules/rules-helper.js';

export function rulesCommand(yargs) {
  yargs.command({
    command: 'rules <name>',
    describe: 'Assists with creating import script rules.',
    builder: (yargs) => {
      return yargs.positional('name', {
        describe: 'Name of the person to greet',
        type: 'string'
      });
    },
    handler: (argv) => {
      console.log(greet(argv.name));
    }
  });
}
