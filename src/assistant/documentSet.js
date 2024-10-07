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

import {readFromFile, writeToFile} from '../utils/fileUtils.js';

const FILENAME = 'documentSet.json';

const getDocumentSet = (outputPath) => {
  const manifestText = readFromFile(`.${outputPath}/${FILENAME}`);
  const manifestArray = manifestText ? JSON.parse(manifestText) : [];
  return new Set(manifestArray);
}

const writeDocumentSet = (outputPath, documentSet) => {
  const manifestArray = Array.from(documentSet);
  const manifestText = JSON.stringify(manifestArray, null, 2);
  writeToFile(`.${outputPath}/${FILENAME}`, manifestText);
}

export {
  getDocumentSet,
  writeDocumentSet,
}
