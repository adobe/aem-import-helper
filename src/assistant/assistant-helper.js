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

import getBuilder from './assistant-builder.js';
import { writeToFile } from '../utils/fileUtils.js';
import chalk from 'chalk';
import { helperEvents } from '../events.js';

const DEFAULT_IMPORTER_PATH = '/tools/importer';

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
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Removal script generated successfully in ${getDurationText(startTime)}`));
};

const runBlockAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addBlock(name, prompt);
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Block scripts generated successfully in ${getDurationText(startTime)}`));
};

const runCellAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addCellParser(name, prompt);
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`${name} block parser generated successfully in ${getDurationText(startTime)}`));
};

const runPageAssistant = async ({ url, name, prompt, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  const startTime = Date.now();
  const builder = await getBuilder(url, { useExisting: true, outputPath, stage });
  const manifest = await builder.addPageTransformer(name, prompt);
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`${name} page transformation generated successfully in ${getDurationText(startTime)}`));
};

export {
  runStartAssistant,
  runRemovalAssistant,
  runBlockAssistant,
  runCellAssistant,
  runPageAssistant,
};
