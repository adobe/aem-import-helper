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

export function checkEnvironment(env) {
  // Ensure required environment variable is set
  if (typeof env.AEM_IMPORT_API_KEY !== 'string') {
    console.error(chalk.red('Error: Ensure the AEM_IMPORT_API_KEY environment variable is set.'));
    process.exit(1);
  }
}
