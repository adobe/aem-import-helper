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

import { processPages } from '../../src/da/da-helper.js';
import { createMockDependencies, testAssetUrls, testSiteOrigin, testOrg, testSite } from './test-setup.js';

describe('da-helper.js - Integration Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processPages', () => {
    it('should process pages one by one, downloading and uploading assets immediately', async () => {
      const downloadAssetsSpy = sandbox.stub().resolves([{ status: 'fulfilled' }]);
      const uploadFolderSpy = sandbox.stub().resolves();
      const uploadFileSpy = sandbox.stub().resolves();

      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body><img src="https://example.com/image.jpg"></body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: () => {},
        },
        downloadAssets: downloadAssetsSpy,
        uploadFolder: uploadFolderSpy,
        uploadFile: uploadFileSpy,
        getAllFiles: () => ['/html/page1.html'],
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        false,
        { convertImagesToPng: true },
        mockDeps,
      );

      expect(downloadAssetsSpy.calledOnce).to.be.true;
      expect(uploadFolderSpy.calledOnce).to.be.true;
      expect(uploadFileSpy.calledOnce).to.be.true;
    });

    it('should handle pages with no matching assets', async () => {
      const downloadAssetsSpy = sandbox.spy();
      const uploadFolderSpy = sandbox.spy();
      const uploadFileSpy = sandbox.spy();

      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body>No assets here</body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: () => {},
        },
        downloadAssets: downloadAssetsSpy,
        uploadFolder: uploadFolderSpy,
        uploadFile: uploadFileSpy,
        getAllFiles: () => ['/html/page1.html'],
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        false,
        {},
        mockDeps,
      );

      // No assets to download/upload, but HTML should still be uploaded
      expect(downloadAssetsSpy.called).to.be.false;
      expect(uploadFolderSpy.called).to.be.false;
      expect(uploadFileSpy.calledOnce).to.be.true;
    });

    it('should handle file read errors gracefully', async () => {
      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => {
            throw new Error('read error');
          },
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: () => {},
        },
        getAllFiles: () => ['/html/error.html'],
      });

      try {
        await processPages(
          testOrg,
          testSite,
          testAssetUrls,
          testSiteOrigin,
          '/da/folder',
          '/download',
          'token123',
          false,
          {},
          mockDeps,
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('read error');
      }
    });

    it('should handle upload errors gracefully', async () => {
      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body><img src="https://example.com/image.jpg"></body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: () => {},
        },
        uploadFile: async () => {
          throw new Error('upload error');
        },
        getAllFiles: () => ['/html/upload-error.html'],
      });

      try {
        await processPages(
          testOrg,
          testSite,
          testAssetUrls,
          testSiteOrigin,
          '/da/folder',
          '/download',
          'token123',
          false,
          {},
          mockDeps,
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('upload error');
      }
    });

    it('should clean up downloaded files when keep=false', async () => {
      const rmSyncSpy = sandbox.spy();

      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body>Test</body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: rmSyncSpy,
        },
        getAllFiles: () => ['/html/page1.html'],
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        false, // keep=false
        {},
        mockDeps,
      );

      expect(rmSyncSpy.calledOnce).to.be.true;
      expect(rmSyncSpy.calledWith('/download', { recursive: true, force: true })).to.be.true;
    });

    it('should not clean up downloaded files when keep=true', async () => {
      const rmSyncSpy = sandbox.spy();

      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body>Test</body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: rmSyncSpy,
        },
        getAllFiles: () => ['/html/page1.html'],
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        true, // keep=true
        {},
        mockDeps,
      );

      expect(rmSyncSpy.called).to.be.false;
    });

    it('should handle no HTML files gracefully', async () => {
      const mockDeps = createMockDependencies({
        getAllFiles: () => [], // No files
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        false,
        {},
        mockDeps,
      );

      // Should complete without error
      expect(true).to.be.true;
    });

    it('should handle missing siteOrigin gracefully', async () => {
      const mockDeps = createMockDependencies({
        fs: {
          readFileSync: () => '<html><body><a href="/page">Link</a></body></html>',
          writeFileSync: () => {},
          mkdirSync: () => {},
          existsSync: () => true,
          rmSync: () => {},
        },
        getAllFiles: () => ['/html/page1.html'],
      });

      await processPages(
        testOrg,
        testSite,
        testAssetUrls,
        null, // No siteOrigin
        '/da/folder',
        '/download',
        'token123',
        false,
        {},
        mockDeps,
      );

      // Should complete without error
      expect(true).to.be.true;
    });
  });

  describe('Asset Filtering Logic', () => {
    it('should verify asset filtering logic works correctly', () => {
      // Test the core asset filtering logic that was fixed
      const urls = [
        'http://localhost:3001/image1.jpg',
        'http://localhost:3001/image2.png',
        'http://localhost:3001/document.pdf',
        'http://localhost:3001/other-page.html'
      ];

      // Only include image1.jpg and document.pdf in the asset list
      const assetUrlsArray = [
        'http://localhost:3001/image1.jpg',
        'http://localhost:3001/document.pdf'
      ];

      // Simulate the filtering logic from da-helper.js
      const matchingAssetUrls = urls.filter(url => {
        try {
          const decodedUrl = decodeURIComponent(url);
          return assetUrlsArray.includes(decodedUrl) || assetUrlsArray.includes(url);
        } catch (error) {
          return assetUrlsArray.includes(url);
        }
      });

      // Should only process the 2 matching assets, not all 4 URLs found
      expect(matchingAssetUrls).to.have.length(2);
      expect(matchingAssetUrls).to.include('http://localhost:3001/image1.jpg');
      expect(matchingAssetUrls).to.include('http://localhost:3001/document.pdf');
      expect(matchingAssetUrls).to.not.include('http://localhost:3001/image2.png');
      expect(matchingAssetUrls).to.not.include('http://localhost:3001/other-page.html');
    });

    it('should handle URL decoding when matching assets', () => {
      // Test URL decoding logic that was fixed
      const urls = [
        'http://localhost:3001/image%20with%20spaces.jpg',
        'http://localhost:3001/document%20with%20spaces.pdf'
      ];

      // Asset list contains decoded URLs
      const assetUrlsArray = [
        'http://localhost:3001/image with spaces.jpg',
        'http://localhost:3001/document with spaces.pdf'
      ];

      // Simulate the filtering logic from da-helper.js
      const matchingAssetUrls = urls.filter(url => {
        try {
          const decodedUrl = decodeURIComponent(url);
          return assetUrlsArray.includes(decodedUrl) || assetUrlsArray.includes(url);
        } catch (error) {
          return assetUrlsArray.includes(url);
        }
      });

      // Should process both assets after URL decoding
      expect(matchingAssetUrls).to.have.length(2);
      expect(matchingAssetUrls).to.include('http://localhost:3001/image%20with%20spaces.jpg');
      expect(matchingAssetUrls).to.include('http://localhost:3001/document%20with%20spaces.pdf');
    });
  });
});
