/*
 * Copyright 2025 Adobe. All rights reserved.
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

/**
 * Derive the DAM root folder name (first segment under /content/dam) from asset mappings.
 * @param {Map<string, string>} assetMappings - Map of source URL to JCR asset path
 * @returns {string|null} First segment under /content/dam (e.g. 'site') or null if none found
 */
export function getDamRootFolder(assetMappings) {
  for (const jcrAssetPath of assetMappings.values()) {
    // make sure that the asset path is not the root DAM folder, skip it if is
    const dir = path.dirname(jcrAssetPath);
    if (dir === '/content/dam') {
      continue;
    }

    const match = jcrAssetPath?.match(/^\/content\/dam\/([^/]+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}
