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
  });



  describe('processPages', () => {
    it('should process pages one by one, downloading and uploading assets immediately', async () => {
      const createdFolders = new Set(['/html', '/download', '/test', '/test/.page1']);
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
      const getHTMLFilesStub = sinon.stub().returns(['/test/page1.html']);
      const mockDeps = {
        fs: mockFs,
        path: mockPath,
        chalk: mockChalk,
        JSDOM,
        downloadAssets: mockDownloadAssets,
        uploadFolder: mockUploadFolder,
        uploadFile: mockUploadFile,
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      expect(results).to.be.an('array');
      expect(results[0].filePath).to.equal('/test/page1.html');
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
      expect(getHTMLFilesStub.calledOnce).to.be.true;
      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledOnce).to.be.true; // Once for HTML
    });

    it('should handle pages with no matching assets', async () => {
      const createdFolders = new Set(['/html', '/download', '/test']);
      const mockFs = {
        existsSync: sinon.stub().callsFake((p) => createdFolders.has(p)),
        mkdirSync: sinon.stub().callsFake((p) => createdFolders.add(p)),
        readFileSync: sinon.stub().returns('<html><img src="other.jpg"></html>'),
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      expect(results[0].downloadedAssets).to.deep.equal([]);
      expect(mockUploadFolder.called).to.be.false; // No assets to upload
      expect(mockUploadFile.calledOnce).to.be.true; // Only for HTML
      expect(results[0].uploaded).to.be.true;
    });

    it('should preserve shadow folder structure when uploading assets', async () => {
      const createdFolders = new Set(['/html', '/download', '/html/subdir', '/download/subdir', '/download/subdir/.page3']);
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      
      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledOnce).to.be.true; // Once for HTML

      // Check the asset upload call specifically
      const assetUploadCall = mockUploadFolder.getCall(0);
      expect(assetUploadCall.args[0]).to.equal('/download/subdir/.page3');
      expect(assetUploadCall.args[3].baseFolder).to.equal('/download');
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      expect(results[0].error).to.include('read error');
      expect(results[0].uploaded).to.be.false;
    });

    it('should handle upload errors gracefully', async () => {
      const createdFolders = new Set(['/html', '/download', '/test', '/test/.upload-error']);
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      expect(results[0].error).to.include('upload error');
      expect(results[0].uploaded).to.be.false;
    });

    it('should create download folder if it does not exist', async () => {
      const createdFolders = new Set(['/html', '/test']);
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      expect(mockFs.mkdirSync.calledWith('/download', { recursive: true })).to.be.true;
    });

    it('should handle cleanup errors gracefully', async () => {
      const createdFolders = new Set(['/html', '/download', '/test', '/test/.cleanup-error']);
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
        getAllHtmlFiles: sinon.stub().returns(getHTMLFilesStub()),
      };
      const assetUrls = new Set(['image.jpg']);
      const results = await processPages(
        'https://da.example.com',
        assetUrls,
        '/html',
        '/download',
        'token',
        {},
        3,
        100,
        mockDeps,
      );
      // Should still succeed even if cleanup fails
      expect(results[0].uploaded).to.be.true;
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
    });
  });
}); 