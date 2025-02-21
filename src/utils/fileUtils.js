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
import { mkdir, writeFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';

export function readFromFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return undefined;
  }
}

export async function writeToFile(filePath, fileData) {
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });
  await writeFile(filePath, fileData, 'utf8');
}

export function copyFiles(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.readdirSync(srcDir).forEach(file => {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);

    if (fs.lstatSync(srcFile).isDirectory()) {
      copyFiles(srcFile, destDir);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}
