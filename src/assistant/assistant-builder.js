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

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ImportBuilderFactory } from 'aem-import-builder';
import chalk from 'chalk';
import ora from 'ora';
import { fetchDocument } from './documentService.js';
import { helperEvents } from '../events.js';
import {
  getBaseUrl,
  copyTemplates,
} from './assistant-server.js';
import { getDocumentSet, writeDocumentSet } from './documentSet.js';
import { getRules } from './importRules.js';

/**
 * Start up an Express server in a worker thread for serving templates
 * to the import builder.
 * @return {Promise<void>}
 */
const startServer = () => {
  return new Promise((resolve, reject) => {
    // Start the Express server in a worker thread
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const worker = new Worker(join(__dirname, 'server.js'));

    worker.on('message', (message) => {
      console.log(message);
      resolve();
    });
    worker.on('error', (error) => {
      console.error('Server error:', error);
      reject(error);
    });
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Server stopped with exit code ${code}`);
      }
    });
  });
}

const getBuilder = async (url, { useExisting = false, outputPath, stage }) => {
  console.log(chalk.magenta('Import assistant is analyzing the page...'));
  const auth = {
    apiKey: process.env.AEM_IMPORT_API_KEY,
    environment: stage ? 'stage' : 'prod',
  }

  // copy builder templates to server root
  copyTemplates(outputPath);
  await startServer();

  const factory = ImportBuilderFactory({ baseUrl: getBaseUrl(), ...auth });
  const spinner = ora({ text: 'Initializing...', color: 'yellow' });
  factory.on('start', (msg) => {
    spinner.start(chalk.yellow(msg));
  });
  factory.on('progress', (msg) => {
    spinner.text = chalk.yellow(msg);
  });
  factory.on('complete', () => {
    spinner.succeed();
  });
  helperEvents.on('start', (msg) => {
    spinner.start(chalk.yellow(msg));
  });
  helperEvents.on('progress', (msg) => {
    spinner.text = chalk.yellow(msg);
  });
  helperEvents.on('complete', () => {
    spinner.succeed();
  });

  const documentSet = useExisting ? getDocumentSet(outputPath) : new Set();
  const rules = useExisting? await getRules(outputPath) : undefined;
  const page = await fetchDocument(url, { documents: documentSet });
  writeDocumentSet(outputPath, documentSet);
  return factory.create({ mode: 'script', rules, page });
}

export default getBuilder;
