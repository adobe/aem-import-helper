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
  });

  describe('getFullyQualifiedAssetUrls', () => {
    it('should return null when assetUrls is null or undefined', () => {
      const siteOrigin = 'https://example.com';
      
      expect(getFullyQualifiedAssetUrls(null, siteOrigin)).to.be.null;
      expect(getFullyQualifiedAssetUrls(undefined, siteOrigin)).to.be.null;
    });

    it('should return null when siteOrigin is null or undefined', () => {
      const assetUrls = ['image.jpg', '/path/file.png'];
      
      expect(getFullyQualifiedAssetUrls(assetUrls, null)).to.be.null;
      expect(getFullyQualifiedAssetUrls(assetUrls, undefined)).to.be.null;
      expect(getFullyQualifiedAssetUrls(assetUrls, '')).to.be.null;
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

  describe('processPages', () => {
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results).to.be.an('array');
      expect(results[0].filePath).to.equal('/html/page1.html');
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
      expect(getHTMLFilesStub.calledOnce).to.be.true;
      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledOnce).to.be.true; // Once for HTML
      
      // Check that the HTML content was updated with proper references
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('https://content.da.live/org/site/.page1/image.jpg'); // Asset reference updated

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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      
      // Check that the HTML content was updated correctly
      expect(mockFs.writeFileSync.calledOnce).to.be.true;
      const writtenContent = mockFs.writeFileSync.getCall(0).args[1];
      expect(writtenContent).to.include('https://content.da.live/org/site/.page1/image.jpg'); // Asset reference updated
      expect(writtenContent).to.include('https://content.da.live/org/site/other-page'); // Page reference updated (extension removed)
      expect(writtenContent).to.include('https://content.da.live/org/site/absolute'); // Absolute URL updated (extension removed)
      expect(writtenContent).to.include('https://external.com/some-page.html'); // External URL not updated
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      expect(results[0].downloadedAssets).to.deep.equal([]);
      expect(mockUploadFolder.called).to.be.false; // No assets to upload
      expect(mockUploadFile.calledOnce).to.be.true; // Only for HTML
      expect(results[0].uploaded).to.be.true;
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      
      expect(mockUploadFolder.calledOnce).to.be.true; // Once for assets
      expect(mockUploadFile.calledOnce).to.be.true; // Once for HTML

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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        getAllFiles: sinon.stub().returns(getHTMLFilesStub()),
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
        { maxRetries: 3, retryDelay: 100 },
        mockDeps,
      );
      // Should still succeed even if cleanup fails
      expect(results[0].uploaded).to.be.true;
      expect(results[0].downloadedAssets).to.deep.equal(['image.jpg']);
      // Final cleanup should be called for the download folder
      expect(mockFs.unlinkSync.calledWith('/download')).to.be.true;
    });
  });
}); 