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

import { describe, it } from 'mocha';
import { expect } from 'chai';
import path from 'path';
import { JSDOM } from 'jsdom';
import chalk from 'chalk';

import {
  extractUrlsFromHTML,
  updateAssetReferencesInHTML,
  updatePageReferencesInHTML,
  getSaveLocation,
  saveHtmlToDownloadFolder,
  uploadHTMLPage,
} from '../../src/da/html-processor.js';

import { createMockDependencies, mockChalk, createHtmlContent } from './test-setup.js';

describe('html-processor.js', () => {
  describe('extractUrlsFromHTML', () => {
    it('should extract URLs from href and src attributes', () => {
      const html = createHtmlContent(`
        <a href="https://example.com/page">Link</a>
        <img src="https://example.com/image.jpg" />
      `);
      
      const deps = { JSDOM };
      const urls = extractUrlsFromHTML(html, deps);
      
      expect(urls).to.include('https://example.com/page');
      expect(urls).to.include('https://example.com/image.jpg');
    });

    it('should skip mailto and tel links', () => {
      const html = createHtmlContent(`
        <a href="mailto:test@example.com">Email</a>
        <a href="tel:+1234567890">Phone</a>
        <a href="https://example.com/page">Link</a>
      `);
      
      const deps = { JSDOM };
      const urls = extractUrlsFromHTML(html, deps);
      
      expect(urls).to.not.include('mailto:test@example.com');
      expect(urls).to.not.include('tel:+1234567890');
      expect(urls).to.include('https://example.com/page');
    });
  });

  describe('updateAssetReferencesInHTML', () => {
    it('should handle images and non-images differently', () => {
      const html = createHtmlContent(`
        <img src="https://example.com/image.jpg" />
        <a href="https://example.com/document.pdf">PDF</a>
      `);
      
      const assetUrls = new Set(['https://example.com/image.jpg', 'https://example.com/document.pdf']);
      const deps = { JSDOM, path, chalk: mockChalk };
      
      const result = updateAssetReferencesInHTML(
        'page-parent-folder/.board-paper-templates-and-submission-information',
        html,
        assetUrls,
        'org',
        'site',
        deps,
      );
      
      expect(result).to.include('src="https://content.da.live/org/site/page-parent-folder/.board-paper-templates-and-submission-information/image.jpg"');
      expect(result).to.include('href="https://main--site--org.aem.page/page-parent-folder/media/document.pdf"');
    });

    it('should handle image assets with relative paths', () => {
      const html = createHtmlContent(`
        <img src="https://example.com/photo.png" />
      `);
      
      const assetUrls = new Set(['https://example.com/photo.png']);
      const deps = { JSDOM, path, chalk: mockChalk };
      
      const result = updateAssetReferencesInHTML(
        'test-folder/.test-page',
        html,
        assetUrls,
        'org',
        'site',
        deps,
      );
      
      expect(result).to.include('src="https://content.da.live/org/site/test-folder/.test-page/photo.png"');
    });

    it('should handle non-image assets correctly', () => {
      const html = createHtmlContent(`
        <a href="https://example.com/document.pdf">Document</a>
      `);
      
      const assetUrls = new Set(['https://example.com/document.pdf']);
      const deps = { JSDOM, path, chalk: mockChalk };
      
      const result = updateAssetReferencesInHTML(
        '.page-name',
        html,
        assetUrls,
        'org',
        'site',
        deps,
      );
      
      expect(result).to.include('href="https://main--site--org.aem.page/media/document.pdf"');
    });

    it('should handle assets with parent path correctly', () => {
      const html = createHtmlContent(`
        <a href="https://example.com/document.pdf">Document</a>
      `);
      
      const assetUrls = new Set(['https://example.com/document.pdf']);
      const deps = { JSDOM, path, chalk: mockChalk };
      
      const result = updateAssetReferencesInHTML(
        'documents/reports/.page-name',
        html,
        assetUrls,
        'org',
        'site',
        deps,
      );
      
      expect(result).to.include('href="https://main--site--org.aem.page/documents/reports/media/document.pdf"');
    });
  });

  describe('updatePageReferencesInHTML', () => {
    it('should update page references normally when siteOrigin is provided', () => {
      const html = createHtmlContent(`
        <a href="http://localhost/test-page">Test Page</a>
      `);
      
      const deps = { JSDOM, chalk: mockChalk };
      const result = updatePageReferencesInHTML(html, [], 'https://example.com', deps);
      
      expect(result).to.include('href="/test-page"');
    });

    it('should update localhost absolute links to site-relative path', () => {
      const html = createHtmlContent(`
        <a href="http://localhost/page">Page</a>
      `);
      
      const deps = { JSDOM, chalk: mockChalk };
      const result = updatePageReferencesInHTML(html, [], 'https://example.com', deps);
      
      expect(result).to.include('href="/page"');
    });

    it('should update relative links without leading slash to start with slash', () => {
      const html = createHtmlContent(`
        <a href="sub/page">Sub Page</a>
      `);
      
      const deps = { JSDOM, chalk: mockChalk };
      const result = updatePageReferencesInHTML(html, [], 'https://example.com', deps);
      
      expect(result).to.include('href="/sub/page"');
    });

    it('should not update external links', () => {
      const html = createHtmlContent(`
        <a href="https://external.com/page">External</a>
      `);
      
      const deps = { JSDOM, chalk: mockChalk };
      const result = updatePageReferencesInHTML(html, [], 'https://example.com', deps);
      
      expect(result).to.include('href="https://external.com/page"');
    });

    it('should return unchanged HTML if no siteOrigin', () => {
      const html = createHtmlContent(`
        <a href="/page">Page</a>
      `);
      
      const deps = { JSDOM, chalk: mockChalk };
      const result = updatePageReferencesInHTML(html, [], null, deps);
      
      expect(result).to.equal(html);
    });
  });

  describe('getSaveLocation', () => {
    it('should return correct save location path', () => {
      const deps = { path };
      const htmlPath = getSaveLocation('/html/page.html', '/html', '/download', deps);
      
      expect(htmlPath).to.equal('/download/html/page.html');
    });

    it('should handle nested paths correctly', () => {
      const deps = { path };
      const htmlPath = getSaveLocation('/html/subfolder/page.html', '/html', '/download', deps);
      
      expect(htmlPath).to.equal('/download/html/subfolder/page.html');
    });
  });

  describe('saveHtmlToDownloadFolder', () => {
    it('should save HTML content', () => {
      let savedContent = '';
      let savedPath = '';
      
      const deps = createMockDependencies({
        fs: {
          mkdirSync: () => {},
          writeFileSync: (path, content) => {
            savedPath = path;
            savedContent = content;
          },
        },
      });
      
      saveHtmlToDownloadFolder('<html></html>', '/path/to/file.html', deps);
      
      expect(savedContent).to.equal('<html></html>');
      expect(savedPath).to.equal('/path/to/file.html');
    });
  });

  describe('uploadHTMLPage', () => {
    it('should upload HTML page with correct parameters', async () => {
      let uploadFileCalled = false;
      let uploadFileArgs = null;
      const logs = [];
      
      const deps = {
        ...createMockDependencies(),
        uploadFile: async (pagePath, daAdminUrl, token, options) => {
          uploadFileCalled = true;
          uploadFileArgs = { pagePath, daAdminUrl, token, options };
          return Promise.resolve();
        },
        chalk: {
          yellow: (msg) => { logs.push(`YELLOW: ${msg}`); return msg; },
          green: (msg) => { logs.push(`GREEN: ${msg}`); return msg; },
          red: (msg) => { logs.push(`RED: ${msg}`); return msg; },
        },
      };
      
      const uploadOptions = { maxRetries: 3, convertImagesToPng: true };
      
      await uploadHTMLPage(
        '/path/to/page.html',
        'https://admin.da.live/source/org/site',
        'test-token',
        uploadOptions,
        deps,
      );
      
      // Verify uploadFile was called with correct parameters
      expect(uploadFileCalled).to.be.true;
      expect(uploadFileArgs.pagePath).to.equal('/path/to/page.html');
      expect(uploadFileArgs.daAdminUrl).to.equal('https://admin.da.live/source/org/site');
      expect(uploadFileArgs.token).to.equal('test-token');
      expect(uploadFileArgs.options).to.deep.equal({
        maxRetries: 3,
        convertImagesToPng: true,
        baseFolder: '/path/to',
      });
      
      // Verify logging
      expect(logs).to.include('YELLOW: Uploading updated HTML page: /path/to/page.html...');
      expect(logs).to.include('GREEN: Successfully uploaded HTML page: /path/to/page.html');
    });

    it('should handle upload errors properly', async () => {
      const logs = [];
      const uploadError = new Error('Upload failed');
      
      const deps = {
        ...createMockDependencies(),
        uploadFile: async () => {
          throw uploadError;
        },
        chalk: {
          yellow: (msg) => { logs.push(`YELLOW: ${msg}`); return msg; },
          green: (msg) => { logs.push(`GREEN: ${msg}`); return msg; },
          red: (msg) => { logs.push(`RED: ${msg}`); return msg; },
        },
      };
      
      let thrownError = null;
      try {
        await uploadHTMLPage(
          '/path/to/page.html',
          'https://admin.da.live/source/org/site',
          'test-token',
          {},
          deps,
        );
      } catch (error) {
        thrownError = error;
      }
      
      // Verify error was re-thrown
      expect(thrownError).to.equal(uploadError);
      
      // Verify error logging
      expect(logs).to.include('YELLOW: Uploading updated HTML page: /path/to/page.html...');
      expect(logs).to.include('RED: Error uploading HTML page: /path/to/page.html:');
      expect(logs).to.not.include('GREEN: Successfully uploaded HTML page: /path/to/page.html');
    });

    it('should merge upload options with baseFolder correctly', async () => {
      let capturedOptions = null;
      
      const deps = {
        ...createMockDependencies(),
        uploadFile: async (pagePath, daAdminUrl, token, options) => {
          capturedOptions = options;
          return Promise.resolve();
        },
        chalk: mockChalk,
      };
      
      const originalOptions = {
        maxRetries: 5,
        retryDelay: 2000,
        existingOption: 'value',
      };
      
      await uploadHTMLPage(
        '/page.html',
        'https://admin.da.live/source/org/site',
        'token',
        originalOptions,
        deps,
      );
      
      // Verify options are merged correctly
      expect(capturedOptions).to.deep.equal({
        maxRetries: 5,
        retryDelay: 2000,
        existingOption: 'value',
        baseFolder: '/',
      });
    });
  });

  describe('Shadow Folder Path Creation', () => {
    it('should create shadow folder path with dot prefix for images', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="http://localhost:3001/test-image.jpg" />
          </body>
        </html>
      `;

      const assetUrls = new Set(['http://localhost:3001/test-image.jpg']);
      const fullShadowPath = 'about-uws/leadership/.executive';
      const org = 'test-org';
      const site = 'test-site';
      const dependencies = { JSDOM, path, chalk };

      const result = updateAssetReferencesInHTML(
        fullShadowPath,
        htmlContent,
        assetUrls,
        org,
        site,
        dependencies,
      );

      // Should create shadow folder path with dot prefix and full DA content URL
      expect(result).to.include(
        'src="https://content.da.live/test-org/test-site/about-uws/leadership/.executive/test-image.jpg"',
      );
    });

    it('should handle different page names correctly for shadow folders', () => {
      const testCases = [
        {
          fullShadowPath: '.simple-page',
          expectedPath: 'src="https://content.da.live/test-org/test-site/.simple-page/test-image.jpg"',
        },
        {
          fullShadowPath: '.complex-page-name',
          expectedPath: 'src="https://content.da.live/test-org/test-site/.complex-page-name/test-image.jpg"',
        },
        {
          fullShadowPath: 'about-uws/leadership/.executive',
          expectedPath: 'src="https://content.da.live/test-org/test-site/about-uws/leadership/.executive/test-image.jpg"',
        },
      ];

      testCases.forEach(({ fullShadowPath, expectedPath }) => {
        const htmlContent = `
          <html>
            <body>
              <img src="http://localhost:3001/test-image.jpg" />
            </body>
          </html>
        `;

        const assetUrls = new Set(['http://localhost:3001/test-image.jpg']);
        const org = 'test-org';
        const site = 'test-site';
        const dependencies = { JSDOM, path, chalk };

        const result = updateAssetReferencesInHTML(
          fullShadowPath,
          htmlContent,
          assetUrls,
          org,
          site,
          dependencies,
        );

        expect(result).to.include(expectedPath);
      });
    });

    it('should create correct shadow folder for nested page structure', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="http://localhost:3001/bg-person.png" />
          </body>
        </html>
      `;

      const assetUrls = new Set(['http://localhost:3001/bg-person.png']);
      const fullShadowPath = 'about-uws/leadership/.executive';
      const org = 'test-org';
      const site = 'test-site';
      const dependencies = { JSDOM, path, chalk };

      const result = updateAssetReferencesInHTML(
        fullShadowPath,
        htmlContent,
        assetUrls,
        org,
        site,
        dependencies,
      );

      // Should create: https://content.da.live/test-org/test-site/about-uws/leadership/.executive/bg-person.png
      expect(result).to.include(
        'src="https://content.da.live/test-org/test-site/about-uws/leadership/.executive/bg-person.png"',
      );
    });

    it('should handle root level pages correctly', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="http://localhost:3001/logo.png" />
          </body>
        </html>
      `;

      const assetUrls = new Set(['http://localhost:3001/logo.png']);
      const fullShadowPath = '.index';
      const org = 'test-org';
      const site = 'test-site';
      const dependencies = { JSDOM, path, chalk };

      const result = updateAssetReferencesInHTML(
        fullShadowPath,
        htmlContent,
        assetUrls,
        org,
        site,
        dependencies,
      );

      // Should create: https://content.da.live/test-org/test-site/.index/logo.png
      expect(result).to.include('src="https://content.da.live/test-org/test-site/.index/logo.png"');
    });
  });
});
