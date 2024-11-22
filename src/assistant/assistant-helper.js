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
import { writeToFile } from '../utils/fileUtils.js';
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

const DEFAULT_IMPORTER_PATH = '/tools/importer';

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

const getBuilder = async (url, { useExisting = false, outputPath, stage}) => {
  console.log(chalk.magenta('Import assistant is analyzing the page...'));
  const auth = {
    apiKey: process.env.AEM_IMPORT_API_KEY,
    environment: stage ? 'stage' : 'prod'
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

const writeManifestFiles = async (manifest, outputPath) => {
  const { files = [] } = manifest;

  const writeSingleManifestFile = async ({ name, contents }) => {
    // Check if contents is not empty before writing the file
    if (contents) {
      await writeToFile(`.${outputPath}${name}`, contents);
      helperEvents.emit('start', `File ${name} was written to ${outputPath}`);
    } else {
      helperEvents.emit('start', `File ${name} was skipped due to missing content`);
    }
    helperEvents.emit('complete');
  }

  // Collect all promises for file writing
  const writePromises = files.map(writeSingleManifestFile);

  // Wait for all file writing to complete
  await Promise.all(writePromises);
}

const getDurationText = (startTime) => {
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 6000);
  const seconds = ((duration % 6000) / 1000).toFixed(2);
  return `${minutes} minutes ${seconds} seconds`;
}

const runStartAssistant = async ({ url, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { outputPath, stage });
  const manifest = await builder.buildProject();
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Import scripts generated successfully in ${getDurationText(startTime)}`));
};

const runRemovalAssistant = async ({ url, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addCleanup(prompt);
  writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Removal script generated successfully in ${getDurationText(startTime)}`));
};

const runBlockAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addBlock(name, prompt);
  writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Block scripts generated successfully in ${getDurationText(startTime)}`));
};

const runCellAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addCellParser(name, prompt);
  writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`${name} block parser generated successfully in ${getDurationText(startTime)}`));
};

const runPageAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage});
  const manifest = await builder.addPageTransformer(name, prompt);
  writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`${name} page transformation generated successfully in ${getDurationText(startTime)}`));
};

export {
  runStartAssistant,
  runRemovalAssistant,
  runBlockAssistant,
  runCellAssistant,
  runPageAssistant,
};
