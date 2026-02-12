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
import sinon from 'sinon';

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
export const createMockDependencies = (overrides = {}) => {
  const dependencies = {
    fs: {
      readFileSync: sinon.stub().returns('<div></div>'),
      writeFileSync: sinon.stub(),
      mkdirSync: sinon.stub(),
      existsSync: sinon.stub().returns(true),
      rmSync: sinon.stub(),
      ...overrides.fs,
    },
    path,
    JSDOM,
    chalk: mockChalk,
    downloadAssets: sinon.stub().callsFake(async (mapping) => Array.from(mapping.keys()).map(() => ({ status: 'fulfilled' }))),
    uploadFolder: sinon.stub().resolves({ 
      success: true, 
      totalFiles: 0, 
      uploadedFiles: 0, 
      failedFiles: 0, 
      results: [], 
    }),
    uploadFile: sinon.stub().resolves(),
    getAllFiles: sinon.stub().returns(['/html/page1.html']),
    ...overrides,
  };

  // Apply overrides to individual properties if they exist
  Object.keys(overrides).forEach(key => {
    if (typeof overrides[key] === 'function' && dependencies[key]) {
      dependencies[key] = sinon.stub().callsFake(overrides[key]);
    }
  });

  return dependencies;
};

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
<div>
  ${content}
</div>
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
