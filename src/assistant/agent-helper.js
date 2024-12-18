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
import { readFromFile } from '../utils/fileUtils.js';
import chalk from 'chalk';
import {
  DEFAULT_IMPORTER_PATH,
  getDurationText,
  writeManifestFiles,
} from './assistant-helper.js';

async function orchestrator(assistants) {
  const results = [];
  for (const assistantFunc of assistants) {
    results.push(await assistantFunc());
  }
  return results;
}

function combineManifests(manifests = []) {
  const allFiles = manifests.reduce((acc, val) => ([...acc, ...(val.files || [])]), []);

  const fileMap = new Map();
  allFiles.forEach((file) => {
    fileMap.set(file.name, file);
  });

  return { files: Array.from(fileMap.values()) };
}

const runMappingAgent = async ({ mappingPath, outputPath = DEFAULT_IMPORTER_PATH, stage = false }) => {
  console.log(chalk.green(`
    ____                           __     _____           _       __     ___                    __ 
   /  _/___ ___  ____  ____  _____/ /_   / ___/__________(_)___  / /_   /   | ____ ____  ____  / /_
   / // __ \`__ \\/ __ \\/ __ \\/ ___/ __/   \\__ \\/ ___/ ___/ / __ \\/ __/  / /| |/ __ \`/ _ \\/ __ \\/ __/
 _/ // / / / / / /_/ / /_/ / /  / /_    ___/ / /__/ /  / / /_/ / /_   / ___ / /_/ /  __/ / / / /_  
/___/_/ /_/ /_/ .___/\\____/_/   \\__/   /____/\\___/_/  /_/ .___/\\__/  /_/  |_\\__, /\\___/_/ /_/\\__/  
             /_/                                       /_/                 /____/                           
`));

  const startTime = Date.now();
  // load mapping file
  const mappingText = readFromFile(`.${outputPath}/${mappingPath}`);
  const mapping = JSON.parse(mappingText);
  const navMapping = mapping.mapping.find((m) => m.path === '/nav');
  const footerMapping = mapping.mapping.find((m) => m.path === '/footer');
  const builder = await getBuilder(mapping.url, { useExisting: true, outputPath, stage });
  // start adding agents to the mapping workflow
  const agents = [];
  if (!builder.hasProject()) {
    agents.push(() => builder.buildProject());
  }
  if (navMapping) {
    agents.push(() => builder.addCleanup('navigation bar'));
  }
  if (footerMapping) {
    agents.push(() => builder.addCleanup('footer'));
  }
  agents.push(() => builder.addSectionMapping(mappingText));
  // add cell parsing agents for each block
  const allBlocks = mapping.mapping
    .filter(({ path }) => path === mapping.sanitizedPath)
    .flatMap((mapItem) =>
      mapItem.sections.flatMap((section) =>
        section.blocks.map((block) => block),
      ),
    )
    .filter(({ mapping }) => mapping !== 'defaultContent');
  allBlocks.forEach((b) => {
    agents.push(() => builder.addBlockParserMapping(JSON.stringify(b)));
  });
  // run all the agents through the orchestrator
  const workflow = await orchestrator(agents);
  // combine all the workflow manifests
  const manifest = combineManifests(workflow);
  await writeManifestFiles(manifest, outputPath);
  console.log(chalk.green(`Import script successfully generated from section mapping in ${getDurationText(startTime)}`));
};

export {
  runMappingAgent,
};
