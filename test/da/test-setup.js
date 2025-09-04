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
import { JSDOM } from 'jsdom';

// Common mock objects for DA tests
export const mockChalk = {
  green: (msg) => msg,
  red: (msg) => msg,
  blue: (msg) => msg,
  yellow: (msg) => msg,
  cyan: (msg) => msg,
  gray: (msg) => msg,
};

// Common mock dependencies
export const createMockDependencies = (overrides = {}) => ({
  fs: {
    readFileSync: () => '<html><body></body></html>',
    writeFileSync: () => {},
    mkdirSync: () => {},
    existsSync: () => true,
    rmSync: () => {},
    ...overrides.fs,
  },
  path,
  JSDOM,
  chalk: mockChalk,
  downloadAssets: async (mapping) => Array.from(mapping.keys()).map(() => ({ status: 'fulfilled' })),
  uploadFolder: async () => {},
  uploadFile: async () => {},
  getAllFiles: () => ['/html/page1.html'],
  ...overrides,
});

// Common test data
export const testAssetUrls = [
  'https://example.com/image.jpg',
  'https://example.com/document.pdf',
  'https://example.com/report.pdf',
  'https://example.com/photo.png',
];

export const testSiteOrigin = 'https://example.com';
export const testOrg = 'org';
export const testSite = 'site';

// Helper functions for test setup
export const createHtmlContent = (content) => `
<html>
<head></head>
<body>
  ${content}
</body>
</html>
`;

export const createMockElement = (tag, attributes = {}) => {
  const element = {
    tagName: tag.toUpperCase(),
    attributes,
    getAttribute: (name) => attributes[name] || null,
    setAttribute: (name, value) => { attributes[name] = value; },
  };
  return element;
};
