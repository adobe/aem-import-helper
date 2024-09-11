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
import esbuild from 'esbuild';

/**
 * Prepares the given import script by bundling it up.
 * @param {string} importJsPath - Path on the filesystem to the import.js entry point
 * @returns {string} - import.js bundle
 */
function prepareImportScript(importJsPath) {
  try {
    const bundle = esbuild.buildSync({
      entryPoints: [importJsPath],
      bundle: true,
      write: false,
      globalName: 'CustomImportScript',
      format: 'iife',
      platform: 'browser',
      target: ['es2015'],
    })

    return bundle.outputFiles[0].text;
  } catch (error) {
    console.error('Import.js bundling failed:', error)
    throw error;
  }
}

export default prepareImportScript;
