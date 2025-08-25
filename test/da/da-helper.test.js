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

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import path from 'path';
import { JSDOM } from 'jsdom';

import {
  createAssetMapping,
  processPages,
  getFullyQualifiedAssetUrls,
  updatePageReferencesInHTML,
  sanitizeFilename,
  sanitizePath,
  generateDocumentPath,
} from '../../src/da/da-helper.js';

const mockChalk = {
  green: (msg) => msg,
  red: (msg) => msg,
  blue: (msg) => msg,
  yellow: (msg) => msg,
  gray: (msg) => msg,
  cyan: (msg) => msg,
};

describe('da-helper.js', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('createAssetMapping', () => {
    it('should map asset URLs to shadow folder paths', () => {
      const assetUrls = [
        'https://example.com/styles.css',
        'https://example.com/script.js',
        'https://example.com/image.jpg',
        'https://example.com/subfolder/icon.png',
        'https://example.com/document.pdf',
      ];
      const result = createAssetMapping(assetUrls, '.mypage');
      expect(result.get('https://example.com/styles.css')).to.equal('/.mypage/styles.css');
      expect(result.get('https://example.com/script.js')).to.equal('/.mypage/script.js');
      expect(result.get('https://example.com/image.jpg')).to.equal('/.mypage/image.jpg');
      expect(result.get('https://example.com/subfolder/icon.png')).to.equal('/.mypage/icon.png');
      expect(result.get('https://example.com/document.pdf')).to.equal('/.mypage/document.pdf');
    });

    it('should handle relative asset URLs', () => {
      const assetUrls = ['local.jpg', 'subdir/photo.png'];
      const result = createAssetMapping(assetUrls, '.page');
      expect(result.get('local.jpg')).to.equal('/.page/local.jpg');
      expect(result.get('subdir/photo.png')).to.equal('/.page/photo.png');
    });

    it('should handle empty assetUrls', () => {
      const assetUrls = [];
      const result = createAssetMapping(assetUrls, '.page');
      expect(result.size).to.equal(0);
    });

    it('should handle empty fullShadowPath', () => {
      const assetUrls = ['foo.js'];
      const result = createAssetMapping(assetUrls, '');
      expect(result.get('foo.js')).to.equal('//foo.js');
    });

    it('should sanitize filenames while preserving extension', () => {
      const assetUrls = [
        'https://example.com/assets/My File(1).JPG',
        'subdir/Img.Name v2.PNG',
      ];
      const result1 = createAssetMapping([assetUrls[0]], '.mypage');
      expect(result1.get(assetUrls[0])).to.equal('/.mypage/my-file-1.jpg');

      const result2 = createAssetMapping([assetUrls[1]], '.page');
      // subdir portion is discarded by mapping; only basename is used
      expect(result2.get(assetUrls[1])).to.equal('/.page/img-name-v2.png');
    });
  });

  describe('sanitizers', () => {
    describe('sanitizeFilename', () => {
      it('should lowercase and replace non-alphanumerics with hyphens', () => {
        expect(sanitizeFilename('Hello World!')).to.equal('hello-world');
      });
      it('should strip diacritics and collapse hyphens', () => {
        expect(sanitizeFilename('Café — menú')).to.equal('cafe-menu');
      });
      it('should return empty for empty input', () => {
        expect(sanitizeFilename('')).to.equal('');
      });
    });

    describe('sanitizePath', () => {
      it('should sanitize each URL path segment', () => {
        expect(sanitizePath('/A B/C&D/file.name')).to.equal('/a-b/c-d/file.name');
      });
      it('should handle paths without extension', () => {
        expect(sanitizePath('/A/B C')).to.equal('/a/b-c');
      });
      it('should return empty for falsy input', () => {
        expect(sanitizePath('')).to.equal('');
      });
    });

    describe('generateDocumentPath', () => {
      it('should decode, lowercase, strip .html/.htm and sanitize', () => {
        expect(generateDocumentPath('https://example.com/Abc%20Def/Page.htm'))
          .to.equal('/abc-def/page');
      });
      it('should convert /index to / and trim trailing slash', () => {
        expect(generateDocumentPath('https://example.com/section/index')).to.equal('/section');
        expect(generateDocumentPath('https://example.com/index')).to.equal('/');
      });
      it('should replace non [a-z0-9\\/] with hyphens', () => {
        expect(generateDocumentPath('https://example.com/A&B/C+D.html')).to.equal('/a-b/c-d');
      });
      it('should support relative URLs', () => {
        expect(generateDocumentPath('Folder/Page.HTML')).to.equal('/folder/page');
      });
    });
  });

  describe('getFullyQualifiedAssetUrls', () => {
    it('should return original assetUrls when assetUrls is null or undefined', () => {
      const siteOrigin = 'https://example.com';

      expect(getFullyQualifiedAssetUrls(null, siteOrigin)).to.be.null;
      expect(getFullyQualifiedAssetUrls(undefined, siteOrigin)).to.be.undefined;
    });

    it('should return original assetUrls when siteOrigin is null or undefined', () => {
      const assetUrls = ['image.jpg', '/path/file.png'];

      expect(getFullyQualifiedAssetUrls(assetUrls, null)).to.deep.equal(assetUrls);
      expect(getFullyQualifiedAssetUrls(assetUrls, undefined)).to.deep.equal(assetUrls);
      expect(getFullyQualifiedAssetUrls(assetUrls, '')).to.deep.equal(assetUrls);
    });

    it('should convert relative URLs to fully qualified URLs', () => {
      const assetUrls = ['image.jpg', 'folder/file.png', 'assets/logo.svg'];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result[0]).to.equal('https://example.com/image.jpg');
      expect(result[1]).to.equal('https://example.com/folder/file.png');
      expect(result[2]).to.equal('https://example.com/assets/logo.svg');
    });

    it('should convert absolute URLs (root relative) to fully qualified URLs', () => {
      const assetUrls = ['/images/image.jpg', '/assets/file.png', '/static/logo.svg'];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result[0]).to.equal('https://example.com/images/image.jpg');
      expect(result[1]).to.equal('https://example.com/assets/file.png');
      expect(result[2]).to.equal('https://example.com/static/logo.svg');
    });

    it('should preserve already fully qualified URLs', () => {
      const assetUrls = [
        'https://example.com/image.jpg',
        'http://other.com/file.png',
        'https://cdn.example.com/logo.svg',
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result[0]).to.equal('https://example.com/image.jpg');
      expect(result[1]).to.equal('http://other.com/file.png');
      expect(result[2]).to.equal('https://cdn.example.com/logo.svg');
    });

    it('should convert localhost URLs to use the site origin', () => {
      const assetUrls = [
        'http://localhost:3000/image.jpg',
        'http://localhost:8080/assets/file.png',
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(2);
      expect(result[0]).to.equal('https://example.com/image.jpg');
      expect(result[1]).to.equal('https://example.com/assets/file.png');
    });

    it('should handle mixed URL types correctly', () => {
      const assetUrls = [
        'image.jpg',                              // relative
        '/assets/file.png',                       // absolute (root relative)
        'https://example.com/logo.svg',           // already fully qualified
        'http://localhost:3000/dev-asset.jpg',   // localhost
        'https://cdn.other.com/external.png',     // external fully qualified
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(5);
      expect(result[0]).to.equal('https://example.com/image.jpg');
      expect(result[1]).to.equal('https://example.com/assets/file.png');
      expect(result[2]).to.equal('https://example.com/logo.svg');
      expect(result[3]).to.equal('https://example.com/dev-asset.jpg');
      expect(result[4]).to.equal('https://cdn.other.com/external.png');
    });

    it('should handle empty array input', () => {
      const assetUrls = [];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(0);
    });

    it('should handle Set input correctly', () => {
      const assetUrls = new Set(['image.jpg', '/assets/file.png', 'https://example.com/logo.svg']);
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result).to.include('https://example.com/image.jpg');
      expect(result).to.include('https://example.com/assets/file.png');
      expect(result).to.include('https://example.com/logo.svg');
    });

    it('should handle URLs with query parameters and fragments', () => {
      const assetUrls = [
        'image.jpg?v=123',
        '/assets/file.png#section',
        'https://example.com/logo.svg?cache=bust&v=2',
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result[0]).to.equal('https://example.com/image.jpg?v=123');
      expect(result[1]).to.equal('https://example.com/assets/file.png#section');
      expect(result[2]).to.equal('https://example.com/logo.svg?cache=bust&v=2');
    });

    it('should handle different site origins correctly', () => {
      const assetUrls = ['logo.png', '/images/banner.jpg'];

      // Test with HTTP origin
      let result = getFullyQualifiedAssetUrls(assetUrls, 'http://dev.example.com');
      expect(result[0]).to.equal('http://dev.example.com/logo.png');
      expect(result[1]).to.equal('http://dev.example.com/images/banner.jpg');

      // Test with HTTPS origin
      result = getFullyQualifiedAssetUrls(assetUrls, 'https://prod.example.com');
      expect(result[0]).to.equal('https://prod.example.com/logo.png');
      expect(result[1]).to.equal('https://prod.example.com/images/banner.jpg');

      // Test with origin having a port
      result = getFullyQualifiedAssetUrls(assetUrls, 'https://staging.example.com:8443');
      expect(result[0]).to.equal('https://staging.example.com:8443/logo.png');
      expect(result[1]).to.equal('https://staging.example.com:8443/images/banner.jpg');
    });

    it('should handle real-world asset URL patterns', () => {
      // 
      const assetUrls = [
        'http://localhost:3000/dev-image.jpg',
        '/-/media/images/hero.jpg',
        '/wp-content/uploads/2023/image.jpg',
        'assets/dist/bundle.min.js',
        '/static/images/gallery/photo-1.png',
        'cdn/fonts/OpenSans-Regular.woff2',
        '/api/files/download/document.pdf',
      ];
      const siteOrigin = 'https://myblog.example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(7);
      expect(result[0]).to.equal('https://myblog.example.com/dev-image.jpg');
      expect(result[1]).to.equal('https://myblog.example.com/-/media/images/hero.jpg');
      expect(result[2]).to.equal('https://myblog.example.com/wp-content/uploads/2023/image.jpg');
      expect(result[3]).to.equal('https://myblog.example.com/assets/dist/bundle.min.js');
      expect(result[4]).to.equal('https://myblog.example.com/static/images/gallery/photo-1.png');
      expect(result[5]).to.equal('https://myblog.example.com/cdn/fonts/OpenSans-Regular.woff2');
      expect(result[6]).to.equal('https://myblog.example.com/api/files/download/document.pdf');
    });

    it('should handle URLs with special characters', () => {
      const assetUrls = [
        'http://localhost:3000/dev-image.jpg?v=123',
        '/-/media/images/hero.jpg#section',
        '/wp-content/uploads/2023/image.jpg?cache=bust&v=2',
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.be.an('array');
      expect(result).to.have.length(3);
      expect(result[0]).to.equal('https://example.com/dev-image.jpg?v=123');
      expect(result[1]).to.equal('https://example.com/-/media/images/hero.jpg#section');
      expect(result[2]).to.equal('https://example.com/wp-content/uploads/2023/image.jpg?cache=bust&v=2');
    });
  });

  describe('updatePageReferencesInHTML', () => {
    it('should return unchanged HTML content when siteOrigin is null', () => {
      const htmlContent = '<html><a href="/test-page.html">Test Link</a><a href="https://example.com/page">External Link</a></html>';
      const matchingAssetUrls = [];
      const siteOrigin = null; // Missing siteOrigin

      const result = updatePageReferencesInHTML(htmlContent, matchingAssetUrls, siteOrigin, {
        JSDOM,
        chalk: mockChalk,
      });

      // Should return unchanged HTML content
      expect(result).to.equal(htmlContent);
    });

    it('should return unchanged HTML content when siteOrigin is empty string', () => {
      const htmlContent = '<html><a href="/test-page.html">Test Link</a></html>';
      const matchingAssetUrls = [];
      const siteOrigin = ''; // Empty siteOrigin

      const result = updatePageReferencesInHTML(htmlContent, matchingAssetUrls, siteOrigin, {
        JSDOM,
        chalk: mockChalk,
      });

      // Should return unchanged HTML content
      expect(result).to.equal(htmlContent);
    });

    it('should update page references normally when siteOrigin is provided', () => {
      const htmlContent = '<html><a href="/test-page.html">Test Link</a><a href="https://example.com/page.pdf">Same Origin</a></html>';
      const matchingAssetUrls = [];
      const siteOrigin = 'https://example.com';

      const result = updatePageReferencesInHTML(htmlContent, matchingAssetUrls, siteOrigin, {
        JSDOM,
        chalk: mockChalk,
      });

      // Should update the references
      expect(result).to.include('href="/test-page"'); // .html removed, site-relative
      expect(result).to.include('href="/page-pdf"'); // non-HTML sanitized (dot -> '-')
    });

    it('should update localhost absolute links to site-relative path', () => {
      const htmlContent = '<html><a href="http://localhost/page.html">Localhost Link</a></html>';
      const result = updatePageReferencesInHTML(htmlContent, [], 'https://example.com', {
        JSDOM,
        chalk: mockChalk,
      });
      expect(result).to.include('href="/page"');
    });

    it('should update relative links without leading slash to start with slash', () => {
      const htmlContent = '<html><a href="sub/page.html">Relative Link</a></html>';
      const result = updatePageReferencesInHTML(htmlContent, [], 'https://example.com', {
        JSDOM,
        chalk: mockChalk,
      });
      expect(result).to.include('href="/sub/page"');
    });

    it('should not change mailto links', () => {
      const htmlContent = '<html><a href="mailto:user@example.com">Email</a></html>';
      const result = updatePageReferencesInHTML(htmlContent, [], 'https://example.com', {
        JSDOM,
        chalk: mockChalk,
      });
      expect(result).to.include('href="mailto:user@example.com"');
    });

    it('should rewrite WSU membership same-origin link to site-relative sanitized path', () => {
      const siteOrigin = 'https://main--library--wsu-do.aem.page';
      const htmlContent = '<html><a href="https://main--library--wsu-do.aem.page/about-us/membership">WSU Membership</a></html>';
      const result = updatePageReferencesInHTML(htmlContent, [], siteOrigin, {
        JSDOM,
        chalk: mockChalk,
      });
      expect(result).to.include('href="/about-us/membership"');
    });
  });

  describe('processPages', () => {
    it('should rewrite asset references to DA but keep original extension when imagesToPng is false', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/html', '/download/assets/.page1']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/html/page1.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100, imagesToPng: false },
        mockDeps,
      );

      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('src="https://content.da.live/org/site/.page1/image.jpg"');
      expect(writtenContent).to.not.include('.png');
    });
    it('should process pages one by one, downloading and uploading assets immediately', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/html', '/download/assets/.page1']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2), // Add async rm stub for cleanupPageAssets
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/html/page1.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results).to.be.an('array');
      expect(results[0].filePath).to.equal('/html/page1.html');
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
      expect(getHTMLFilesStub.calledTwice).to.be.true; // Once for HTML files, once for JSON files
      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledTwice).to.be.true; // Once for HTML, once for JSON

      // Check that the HTML content was updated with proper references
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('src="https://content.da.live/org/site/.page1/image.jpg"'); // Asset reference updated with original ext

      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should update page references to point to DA location', async () => {
      const createdFolders = new Set(['/html', '/download', '/html', '/html/.page1']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"><a href="https://external.com/some-page.html">ExternalLink</a><a href="/other-page.html">Link</a><a href="https://example.com/absolute">Absolute</a></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/html/page1.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );

      // Check that the HTML content was updated correctly
      expect(mockFs.writeFileSync.calledOnce).to.be.true;
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('src="https://content.da.live/org/site/.page1/image.jpg"'); // Asset reference updated with original ext
      expect(writtenContent).to.include('href="/other-page"'); // Page reference updated (extension removed, site-relative)
      expect(writtenContent).to.include('href="/absolute"'); // Absolute URL updated (extension removed, site-relative)
      expect(writtenContent).to.include('https://external.com/some-page.html'); // External URL not updated
    });

    it('should handle pages with no matching assets', async () => {
      const createdFolders = new Set(['/html', '/download', '/test']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="other.jpg"><a href="/next.html">Next</a></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/test/page2.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results[0].downloadedAssets).to.deep.equal([]);
      expect(mockUploadFolder.called).to.be.false; // No assets to upload
      expect(mockUploadFile.calledTwice).to.be.true; // Once for HTML, once for JSON
      expect(results[0].uploaded).to.be.true;
      // Page references should be updated even when there are no matching assets
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('href="/next"');
      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should preserve shadow folder structure when uploading assets', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/html/subdir', '/download/subdir', '/download/assets/subdir/.page3']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/html/subdir/page3.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );

      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledTwice).to.be.true; // Once for HTML, once for JSON

      // Check the asset upload call specifically
      const assetUploadCall = mockUploadFolder.getCall(0);
      expect(assetUploadCall.args[0]).to.equal('/download/assets/subdir/.page3');
      expect(assetUploadCall.args[3].baseFolder).to.equal('/download/assets');
      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should handle file read errors gracefully', async () => {
      const createdFolders = new Set(['/html', '/download', '/test']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().throws(new Error('read error')),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/test/error.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results[0].error).to.include('read error');
      expect(results[0].uploaded).to.be.false;
      // Final cleanup should be called for the download folder even on error
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should handle upload errors gracefully', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/test', '/download/assets/test/.upload-error']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().rejects(new Error('upload error'));
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/test/upload-error.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results[0].error).to.include('upload error');
      expect(results[0].uploaded).to.be.false;
      // Final cleanup should be called for the download folder even on error
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should create download folder if it does not exist', async () => {
      const createdFolders = new Set(['/html', '/test', '/download/assets']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/test/page1.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(mockFs.mkdirSync.calledWith('/download', { recursive: true })).to.be.true;
      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should handle cleanup errors gracefully', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/test', '/download/assets/test/.cleanup-error']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="image.jpg"></html>'),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns(['file1.jpg']),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub().throws(new Error('cleanup error')),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArgWith(2, new Error('cleanup error')), // Simulate error
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/test/cleanup-error.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        'https://example.com',
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      // Should still succeed even if cleanup fails
      expect(results[0].uploaded).to.be.true;
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });

    it('should handle missing siteOrigin gracefully and skip page reference updates', async () => {
      const createdFolders = new Set(['/html', '/download', '/download/assets', '/html', '/download/assets/.page1']);
      const originalHtmlContent = '<html><img src="image.jpg"><a href="/other-page.html">Link</a></html>';
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns(originalHtmlContent),
        writeFileSync: sinon.stub(),
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub().returns({ isFile: () => true, isDirectory: () => false }),
        unlinkSync: sinon.stub(),
        rmSync: sinon.stub(),
        rm: sinon.stub().callsArg(2),
      };
      const mockPath = path;
      const mockDownloadAssets = sinon.stub().resolves([{ status: 'fulfilled', value: 'image.jpg' }]);
      const mockUploadFolder = sinon.stub().resolves({ success: true });
      const mockUploadFile = sinon.stub().resolves({ success: true });
      const getHTMLFilesStub = sinon.stub().returns(['/html/page1.html']);
      const mockConsoleWarn = sinon.stub();
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllFiles: sinon.stub().callsFake((dir, exts) => {
          if (exts && exts.includes('.json')) {
            return [];
          }
          return getHTMLFilesStub();
        }),
      };
      const assetUrls = new Set(['image.jpg']);

      // Store original console.warn to restore later
      const originalWarn = console.warn;
      console.warn = mockConsoleWarn;

      const results = await processPages(
        'https://admin.da.live/source/org/site',
        'https://content.da.live/org/site',
        assetUrls,
        null, // Missing siteOrigin
        '/html',
        '/download',
        'token',
        false,
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );

      // Restore console.warn
      console.warn = originalWarn;

      expect(results[0].uploaded).to.be.true;
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);

      // Check that page references were NOT updated (original HTML should be preserved)
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('<a href="/other-page.html">Link</a>'); // Original link unchanged
      expect(writtenContent).to.include('src="https://content.da.live/org/site/.page1/image.jpg"'); // Asset reference updated with original ext
    });
  });

  describe('Error handling and edge cases', () => {
    let mockFs, mockPath, mockJSDOM, mockDownloadAssets, mockUploadFolder, mockUploadFile, mockGetAllFiles;
    let dependencies;

    beforeEach(() => {
      mockFs = {
        existsSync: sandbox.stub(),
        readFileSync: sandbox.stub(),
        writeFileSync: sandbox.stub(),
        mkdirSync: sandbox.stub(),
        statSync: sandbox.stub(),
        rmSync: sandbox.stub(),
        unlinkSync: sandbox.stub(),
      };

      mockPath = {
        relative: sandbox.stub(),
        join: sandbox.stub().callsFake((...args) => args.join('/')),
        dirname: sandbox.stub(),
        basename: sandbox.stub(),
        extname: sandbox.stub(),
        parse: sandbox.stub(),
      };

      mockJSDOM = JSDOM;

      mockDownloadAssets = sandbox.stub();
      mockUploadFolder = sandbox.stub();
      mockUploadFile = sandbox.stub();
      mockGetAllFiles = sandbox.stub();

      dependencies = {
        fs: mockFs,
        path: mockPath,
        JSDOM: mockJSDOM,
        downloadAssets: mockDownloadAssets,
        chalk: mockChalk,
        getAllFiles: mockGetAllFiles,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
      };
    });

    it('should handle HTML upload failure in pages with assets', async () => {
      // Setup for HTML upload failure in main processing branch (covers line 251)
      mockFs.existsSync.returns(true);
      mockFs.readFileSync.returns('<html><img src="image.jpg"></html>');
      mockGetAllFiles.returns(['/html/page1.html']);
      mockPath.relative.withArgs('/html', '/html/page1.html').returns('page1.html');
      mockPath.relative.withArgs('/html', '/html').returns('');
      mockPath.basename.withArgs('/html/page1.html', '.html').returns('page1');
      mockPath.basename.withArgs('/html/page1.html').returns('page1.html');
      mockPath.basename.withArgs('page1.html', '.html').returns('page1');
      mockPath.extname.returns('.html');
      mockPath.dirname.returns('/download/html');
      mockPath.join.callsFake((...args) => args.join('/'));
      mockPath.parse.withArgs('/').returns({ dir: '', name: '' });

      // Mock successful asset operations but failing HTML upload  
      mockDownloadAssets.resolves([{ status: 'fulfilled' }]);
      mockUploadFolder.resolves();
      mockUploadFile.rejects(new Error('HTML upload failed'));

      // Use the exact URL that appears in the HTML for matching
      const assetUrls = new Set(['image.jpg']);
      const siteOrigin = 'https://example.com';

      const results = await processPages(
        'https://admin.da.live/source/org/repo',
        'https://content.da.live/org/repo',
        assetUrls,
        siteOrigin,
        '/html',
        '/download',
        'token',
        false,
        {},
        dependencies,
      );

      expect(results).to.have.length(2); // HTML page + JSON page
      expect(results[0].error).to.be.a('string');
      expect(results[0].error).to.include('HTML upload failed');
      expect(results[0].uploaded).to.be.false;

      // Check JSON result
      expect(results[1].filePath).to.equal('/html/page1.html');
      expect(results[1].uploaded).to.be.false;
    });

    it('should handle HTML upload failure for pages with no assets', async () => {
      // Setup for page with no assets but HTML upload failure (covers lines 468-469)
      mockFs.existsSync.returns(true);
      mockFs.readFileSync.returns('<html><p>No assets here</p></html>');
      mockGetAllFiles.callsFake((dir, exts) => {
        if (exts && exts.includes('.json')) {
          return ['/html/page2.html'];
        }
        return ['/html/page2.html'];
      });
      mockPath.relative.withArgs('/html', '/html/page2.html').returns('page2.html');
      mockPath.relative.withArgs('/html', '/html').returns('');
      mockPath.basename.withArgs('/html/page2.html').returns('page2.html');
      mockPath.extname.returns('.html');
      mockPath.dirname.returns('/download/html');

      // Mock failing HTML upload
      mockUploadFile.rejects(new Error('HTML upload failed for no-asset page'));

      const assetUrls = new Set(['https://example.com/image.jpg']);
      const siteOrigin = 'https://example.com';

      const results = await processPages(
        'https://admin.da.live/source/org/repo',
        'https://content.da.live/org/repo',
        assetUrls,
        siteOrigin,
        '/html',
        '/download',
        'token',
        false,
        {},
        dependencies,
      );

      expect(results).to.have.length(2); // HTML page + JSON page
      expect(results[0].downloadedAssets).to.be.empty;
      expect(results[0].uploaded).to.be.false; // Upload failed
      expect(results[0].error).to.include('HTML upload failed'); // Error should be reported

      // Check that error was logged (uploadFile was called and failed)
      expect(mockUploadFile.calledTwice).to.be.true; // Once for HTML, once for JSON

      // Check JSON result
      expect(results[1].filePath).to.equal('/html/page2.html');
      expect(results[1].uploaded).to.be.false;
    });

    it('should handle both file and directory cleanup in cleanupPageAssets', async () => {
      // Setup for processing page with assets to trigger cleanup (covers lines 312-313)
      mockFs.existsSync.returns(true);
      mockFs.readFileSync.returns('<html><img src="image.jpg"></html>');
      mockGetAllFiles.returns(['/html/page1.html']);

      // Mock path operations
      mockPath.relative.withArgs('/html', '/html/page1.html').returns('page1.html');
      mockPath.relative.withArgs('/html', '/html').returns('');
      mockPath.basename.withArgs('/html/page1.html', '.html').returns('page1');
      mockPath.basename.withArgs('/html/page1.html').returns('page1.html');
      mockPath.basename.withArgs('page1.html', '.html').returns('page1');
      mockPath.extname.returns('.html');
      mockPath.dirname.returns('/download/html');
      mockPath.join.callsFake((...args) => args.join('/'));

      // Setup file stats mocks - cleanupPageAssets gets called with 2 paths
      // First path (HTML file), second path (asset directory) 
      let statCallCount = 0;
      mockFs.statSync.callsFake(() => {
        statCallCount++;
        if (statCallCount === 1) {
          return { isDirectory: () => false, isFile: () => true }; // HTML file 
        } else {
          return { isDirectory: () => true, isFile: () => false }; // Asset directory
        }
      });

      mockDownloadAssets.resolves([{ status: 'fulfilled' }]);
      mockUploadFolder.resolves();
      mockUploadFile.resolves();

      // Use the exact URL that appears in the HTML for matching
      const assetUrls = new Set(['image.jpg']);
      const siteOrigin = 'https://example.com';

      await processPages(
        'https://admin.da.live/source/org/repo',
        'https://content.da.live/org/repo',
        assetUrls,
        siteOrigin,
        '/html',
        '/download',
        'token',
        false,
        {},
        dependencies,
      );

      // Verify both file and directory cleanup methods were called
      expect(mockFs.unlinkSync.called).to.be.true; // For the HTML file
      expect(mockFs.rmSync.called).to.be.true; // For the asset directory
    });

    it('should handle localhost URL replacement in getFullyQualifiedAssetUrl', () => {
      const localhostUrl = 'http://localhost:3000/image.jpg';
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls([localhostUrl], siteOrigin);

      expect(result).to.have.length(1);
      expect(result[0]).to.equal('https://example.com/image.jpg');
    });

    it('should handle URL decoding errors in processSinglePage', async () => {
      // Create an HTML with URLs that will cause decodeURIComponent to fail
      const htmlWithBadUrls = '<html><img src="image%gg.jpg"><img src="valid.jpg"></html>';

      mockFs.existsSync.returns(true);
      mockFs.readFileSync.returns(htmlWithBadUrls);
      mockGetAllFiles.returns(['/html/page1.html']);
      mockPath.relative.withArgs('/html', '/html/page1.html').returns('page1.html');
      mockPath.relative.withArgs('/html', '/html').returns('');
      mockPath.basename.withArgs('/html/page1.html', '.html').returns('page1');
      mockPath.basename.withArgs('/html/page1.html').returns('page1.html');
      mockPath.basename.withArgs('page1.html', '.html').returns('page1');
      mockPath.extname.returns('.html');
      mockPath.dirname.returns('/download/html');

      mockDownloadAssets.resolves([{ status: 'fulfilled' }]);
      mockUploadFolder.resolves();
      mockUploadFile.resolves();

      // Include both valid and invalid URLs in asset set
      const assetUrls = new Set(['https://example.com/image%gg.jpg', 'https://example.com/valid.jpg']);
      const siteOrigin = 'https://example.com';

      const results = await processPages(
        'https://admin.da.live/source/org/repo',
        'https://content.da.live/org/repo',
        assetUrls,
        siteOrigin,
        '/html',
        '/download',
        'token',
        false,
        {},
        dependencies,
      );

      expect(results).to.have.length(2); // HTML page + JSON page
      expect(results[0].uploaded).to.be.true;
      // Should handle the bad URL gracefully and process the valid one

      // Check JSON result
      expect(results[1].filePath).to.equal('/html/page1.html');
      expect(results[1].uploaded).to.be.true;
    });

    it('should handle complex URL scenarios with special characters', () => {
      const assetUrls = [
        'http://localhost:8080/special%20file.jpg',
        '/relative/path.png',
        'https://other-domain.com/external.gif',
        'https://example.com/valid.jpg',
      ];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.have.length(4);
      expect(result[0]).to.equal('https://example.com/special%20file.jpg'); // localhost replaced
      expect(result[1]).to.equal('https://example.com/relative/path.png'); // relative made absolute
      expect(result[2]).to.equal('https://other-domain.com/external.gif'); // external URL preserved
      expect(result[3]).to.equal('https://example.com/valid.jpg'); // already valid preserved
    });

    it('should handle empty and null asset URLs', () => {
      const assetUrls = ['', null, undefined, 'valid.jpg'];
      const siteOrigin = 'https://example.com';

      const result = getFullyQualifiedAssetUrls(assetUrls, siteOrigin);

      expect(result).to.have.length(4);
      expect(result[0]).to.equal(''); // empty string preserved
      expect(result[1]).to.be.null; // null preserved
      expect(result[2]).to.be.undefined; // undefined preserved
      expect(result[3]).to.equal('https://example.com/valid.jpg'); // valid URL processed
    });
  });
}); 