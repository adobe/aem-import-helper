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

import path from 'path';
import { copyFiles } from '../utils/fileUtils.js';
import { findUpSync } from 'find-up';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 3009;

export function getPort() {
  return port;
}

export function getBaseUrl() {
  return `http://localhost:${port}`;
}

export function copyTemplates(outputPath) {
  // Copy templates to server root
  const nodeModulesDir = findUpSync('node_modules', { type: 'directory', cwd: __dirname });
  const srcDir = path.join(nodeModulesDir, 'aem-import-builder', 'dist', 'templates');
  const destDir = path.join(process.cwd(), outputPath, 'templates');
  copyFiles(srcDir, destDir);
}
