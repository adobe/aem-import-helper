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
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

import {
  convertAssetUrlsToMapping,
  updateHrefsInHTML,
  saveUpdatedPages,
  getAllFiles,
  getHTMLFiles,
} from '../../src/da/da-helper.js';

const mockChalk = {
  green: (msg) => msg,
  red: (msg) => msg,
  blue: (msg) => msg,
  yellow: (msg) => msg,
  gray: (msg) => msg,
};

describe('da-helper.js', () => {
  let sandbox;
  let dependencies;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dependencies = {
      fs,
      path,
      chalk: mockChalk,
      JSDOM,
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('convertAssetUrlsToMapping', () => {
    it('should map asset URLs to shadow folder paths', () => {
      const assetUrls = [
        'https://example.com/styles.css',
        'https://example.com/script.js',
        'https://example.com/image.jpg',
        'https://example.com/subfolder/icon.png',
        'https://example.com/document.pdf',
      ];
      const pagePath = '/content/dam/test/mypage.html';
      const result = convertAssetUrlsToMapping(assetUrls, pagePath, dependencies);
      expect(result.get('https://example.com/styles.css')).to.equal('/.mypage/styles.css');
      expect(result.get('https://example.com/script.js')).to.equal('/.mypage/script.js');
      expect(result.get('https://example.com/image.jpg')).to.equal('/.mypage/image.jpg');
      expect(result.get('https://example.com/subfolder/icon.png')).to.equal('/.mypage/icon.png');
      expect(result.get('https://example.com/document.pdf')).to.equal('/.mypage/document.pdf');
    });

    it('should handle relative asset URLs', () => {
      const assetUrls = ['local.jpg', 'subdir/photo.png'];
      const pagePath = '/content/dam/test/page.html';
      const result = convertAssetUrlsToMapping(assetUrls, pagePath, dependencies);
      expect(result.get('local.jpg')).to.equal('/.page/local.jpg');
      expect(result.get('subdir/photo.png')).to.equal('/.page/photo.png');
    });

    it('should handle empty assetUrls', () => {
      const assetUrls = [];
      const pagePath = '/content/dam/test/page.html';
      const result = convertAssetUrlsToMapping(assetUrls, pagePath, dependencies);
      expect(result.size).to.equal(0);
    });

    it('should handle missing pagePath', () => {
      const assetUrls = ['foo.js'];
      const result = convertAssetUrlsToMapping(assetUrls, '', dependencies);
      expect(result.get('foo.js')).to.equal('/foo.js');
    });
  });

  describe('updateHrefsInHTML', () => {
    const daLocation = 'https://da.example.com';
    it('should update asset URLs in HTML with shadow folder', () => {
      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="styles.css">
            <script src="script.js"></script>
          </head>
          <body>
            <img src="image.jpg" alt="test">
            <img src="subfolder/icon.png" alt="icon">
            <a href="document.pdf">PDF</a>
          </body>
        </html>
      `;
      const pagePath = '/content/dam/test/mypage.html';
      const assetUrls = new Set(['image.jpg', 'subfolder/icon.png', 'document.pdf']);
      const result = updateHrefsInHTML(pagePath, html, assetUrls, daLocation, dependencies);
      // Parse the result and check the actual attribute values
      const dom = new JSDOM(result);
      const doc = dom.window.document;
      // Only check a[href] and img[src] since the function doesn't handle link[href] or script[src]
      expect(doc.querySelector('img[alt="test"]').getAttribute('src')).to.equal('https://da.example.com/.mypage/image.jpg');
      expect(doc.querySelector('img[alt="icon"]').getAttribute('src')).to.equal('https://da.example.com/.mypage/icon.png');
      expect(doc.querySelector('a').getAttribute('href')).to.equal('https://da.example.com/.mypage/document.pdf');
      // Verify that link and script elements are not updated
      expect(doc.querySelector('link[rel="stylesheet"]').getAttribute('href')).to.equal('styles.css');
      expect(doc.querySelector('script').getAttribute('src')).to.equal('script.js');
    });

    it('should not update non-matching asset URLs', () => {
      const html = '<html><body><img src="external.jpg"></body></html>';
      const pagePath = '/content/dam/test/page.html';
      const assetUrls = new Set(['foo.jpg']);
      const result = updateHrefsInHTML(pagePath, html, assetUrls, daLocation, dependencies);
      expect(result).to.include('src="external.jpg"');
    });

    it('should handle empty assetUrls', () => {
      const html = '<html><body><img src="image.jpg"></body></html>';
      const pagePath = '/content/dam/test/page.html';
      const assetUrls = new Set();
      const result = updateHrefsInHTML(pagePath, html, assetUrls, daLocation, dependencies);
      expect(result).to.include('src="image.jpg"');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const pagePath = '/content/dam/test/page.html';
      const assetUrls = new Set(['image.jpg']);
      const result = updateHrefsInHTML(pagePath, html, assetUrls, daLocation, dependencies);
      expect(result).to.be.a('string');
    });
  });

  describe('saveUpdatedPages', () => {
    it('should save updated pages to files', () => {
      const pages = [
        { filePath: '/test/page1.html', updatedContent: '<html><body>Page 1</body></html>' },
        { filePath: '/test/page2.html', updatedContent: '<html><body>Page 2</body></html>' },
      ];
      const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
      saveUpdatedPages(pages, { fs, chalk: mockChalk });
      expect(writeFileSyncStub.calledTwice).to.be.true;
      expect(writeFileSyncStub.firstCall.args[0]).to.equal('/test/page1.html');
      expect(writeFileSyncStub.secondCall.args[0]).to.equal('/test/page2.html');
    });

    it('should skip pages with errors', () => {
      const pages = [
        { filePath: '/test/page1.html', updatedContent: '<html></html>', error: 'fail' },
        { filePath: '/test/page2.html', updatedContent: '<html></html>' },
      ];
      const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
      saveUpdatedPages(pages, { fs, chalk: mockChalk });
      expect(writeFileSyncStub.calledOnce).to.be.true;
      expect(writeFileSyncStub.firstCall.args[0]).to.equal('/test/page2.html');
    });

    it('should handle fs write errors gracefully', () => {
      const pages = [
        { filePath: '/test/page1.html', updatedContent: '<html></html>' },
      ];
      const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync').throws(new Error('fail'));
      saveUpdatedPages(pages, { fs, chalk: mockChalk });
      expect(writeFileSyncStub.calledOnce).to.be.true;
    });
  });

  describe('getAllFiles', () => {
    it('should recursively get all files with and without extension filter', () => {
      const mockFs = {
        readdirSync: sinon.stub(),
        statSync: sinon.stub(),
      };
      const mockPath = {
        join: path.join,
        extname: path.extname,
      };
      // Simulate directory structure
      mockFs.readdirSync.withArgs('/root').returns(['a.txt', 'b.html', 'sub']);
      mockFs.readdirSync.withArgs('/root/sub').returns(['c.htm', 'd.md']);
      mockFs.statSync.withArgs('/root/a.txt').returns({ isFile: () => true, isDirectory: () => false });
      mockFs.statSync.withArgs('/root/b.html').returns({ isFile: () => true, isDirectory: () => false });
      mockFs.statSync.withArgs('/root/sub').returns({ isFile: () => false, isDirectory: () => true });
      mockFs.statSync.withArgs('/root/sub/c.htm').returns({ isFile: () => true, isDirectory: () => false });
      mockFs.statSync.withArgs('/root/sub/d.md').returns({ isFile: () => true, isDirectory: () => false });
      // All files
      const allFiles = getAllFiles('/root', [], { fs: mockFs, path: mockPath });
      expect(allFiles).to.have.members(['/root/a.txt', '/root/b.html', '/root/sub/c.htm', '/root/sub/d.md']);
      // Only .html/.htm
      const htmlFiles = getAllFiles('/root', ['.html', '.htm'], { fs: mockFs, path: mockPath });
      expect(htmlFiles).to.have.members(['/root/b.html', '/root/sub/c.htm']);
    });
  });

  describe('getHTMLFiles', () => {
    it.skip('should get all HTML files and apply exclude patterns', () => {
      const mockFs = {
        existsSync: sinon.stub().returns(true),
        statSync: sinon.stub().returns({ isDirectory: () => true }),
      };
      const mockChalk = { blue: () => '', gray: () => '', red: () => '' };
      const mockGetAllFiles = sinon.stub().returns(['/root/a.html', '/root/b.htm', '/root/node_modules/c.html']);
      const result = getHTMLFiles('/root', ['node_modules'], { 
        fs: mockFs, 
        chalk: mockChalk,
        getAllFiles: mockGetAllFiles,
      });
      expect(result).to.have.members(['/root/a.html', '/root/b.htm']);
      expect(mockGetAllFiles.calledOnce).to.be.true;
      expect(mockGetAllFiles.firstCall.args[0]).to.equal('/root');
      expect(mockGetAllFiles.firstCall.args[1]).to.deep.equal(['.html', '.htm']);
    });
    it('should throw if folder does not exist', () => {
      const mockFs = { existsSync: sinon.stub().returns(false) };
      const mockChalk = { red: (msg) => msg };
      expect(() => getHTMLFiles('/bad', [], { fs: mockFs, chalk: mockChalk })).to.throw('Folder not found');
    });
    it('should throw if not a directory', () => {
      const mockFs = {
        existsSync: sinon.stub().returns(true),
        statSync: sinon.stub().returns({ isDirectory: () => false }),
      };
      const mockChalk = { red: (msg) => msg };
      expect(() => getHTMLFiles('/bad', [], { fs: mockFs, chalk: mockChalk })).to.throw('Path is not a directory');
    });
  });

  describe('processHTMLPages', () => {
    it('should process HTML pages, download assets, and update content', async () => {
      const mockFs = {
        readFileSync: sinon.stub().returns('<html><body><img src="asset1.jpg"><a href="asset2.pdf"></a></body></html>'),
      };
      const mockDownloadAssets = sinon.stub().resolves([
        { status: 'fulfilled', value: 'ok' },
        { status: 'fulfilled', value: 'ok' },
      ]);
      const mockDeps = {
        fs: mockFs,
        chalk: mockChalk,
        JSDOM,
        path,
        downloadAssets: mockDownloadAssets,
      };
      const daLocation = 'https://da.example.com';
      const htmlPages = ['/root/page1.html'];
      const assetUrls = new Set(['asset1.jpg', 'asset2.pdf']);
      const downloadFolder = '/downloads';
      const result = await (await import('../../src/da/da-helper.js')).processHTMLPages(
        daLocation,
        htmlPages,
        assetUrls,
        downloadFolder,
        3,
        100,
        mockDeps,
      );
      expect(result[0].filePath).to.equal('/root/page1.html');
      const expectedAssets = new Set(['asset1.jpg', 'asset2.pdf']);
      expect(new Set(result[0].downloadedAssets)).to.deep.equal(expectedAssets);
      expect(result[0].downloadResults[0].status).to.equal('fulfilled');
      expect(result[0].updatedContent).to.be.a('string');
    });
    it('should handle file read errors gracefully', async () => {
      const mockFs = { readFileSync: sinon.stub().throws(new Error('fail read')) };
      const mockDeps = { fs: mockFs, chalk: mockChalk, JSDOM, path, downloadAssets: sinon.stub() };
      const daLocation = 'https://da.example.com';
      const htmlPages = ['/root/page1.html'];
      const assetUrls = new Set(['asset1.jpg']);
      const downloadFolder = '/downloads';
      const result = await (await import('../../src/da/da-helper.js')).processHTMLPages(
        daLocation,
        htmlPages,
        assetUrls,
        downloadFolder,
        3,
        100,
        mockDeps,
      );
      expect(result[0].error).to.include('fail read');
    });
  });
}); 