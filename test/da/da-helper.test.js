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
run 
  afterEach(() => {
    sandbox.restore();
  });

  describe('processPages', () => {
    it('should process pages one by one, downloading and uploading assets immediately', async () => {
      const downloadAssetsSpy = sandbox.stub().callsFake(async (mapping) => 
        Array.from(mapping.keys()).map(() => ({ status: 'fulfilled' }))
      );
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

      // Verify download assets was called with correct parameters
      expect(downloadAssetsSpy.calledOnce).to.be.true;
      const downloadCall = downloadAssetsSpy.getCall(0);
      expect(downloadCall.args[0]).to.be.instanceOf(Map); // Should be a Map (asset mapping)
      expect(downloadCall.args[1]).to.equal('/download'); // Download folder
      expect(downloadCall.args[2]).to.equal(3); // Max retries
      expect(downloadCall.args[3]).to.equal(1000); // Retry delay

      // Verify upload folder was called for assets
      expect(uploadFolderSpy.calledOnce).to.be.true;
      const uploadFolderCall = uploadFolderSpy.getCall(0);
      expect(uploadFolderCall.args[0]).to.include('/.page1'); // Local folder path with shadow folder
      expect(uploadFolderCall.args[1]).to.include('admin.da.live'); // DA admin URL
      expect(uploadFolderCall.args[2]).to.equal('token123'); // Token

      // Verify HTML upload was called
      expect(uploadFileSpy.calledOnce).to.be.true;
      const uploadFileCall = uploadFileSpy.getCall(0);
      expect(uploadFileCall.args[0]).to.include('/html/page1.html'); // HTML file path
      expect(uploadFileCall.args[1]).to.include('admin.da.live'); // DA admin URL
      expect(uploadFileCall.args[2]).to.equal('token123'); // Token
    });

    it('should handle pages with no matching assets', async () => {
      const mockDeps = createMockDependencies();
      
      // HTML content with no asset references
      mockDeps.fs.readFileSync.returns('<html><body><p>Just text content, no images or links</p></body></html>');
      
      await processPages(
        testOrg,
        testSite,
        ['https://example.com/image1.jpg', 'https://example.com/doc.pdf'], // Asset list provided but won't match
        testSiteOrigin,
        '/da/folder',
        '/download',
        'token123',
        false,
        {},
        mockDeps,
      );

      // Verify asset processing behavior - should skip asset operations
      expect(mockDeps.downloadAssets.called).to.be.false; // No matching assets found
      expect(mockDeps.uploadFolder.called).to.be.false; // No assets to upload
      
      // Verify HTML processing still happens - core functionality
      expect(mockDeps.uploadFile.calledOnce).to.be.true; // HTML should still be uploaded
      expect(mockDeps.fs.writeFileSync.calledOnce).to.be.true; // HTML should be saved
      
      // Verify file operations use correct paths
      const writeCall = mockDeps.fs.writeFileSync.getCall(0);
      expect(writeCall.args[0]).to.include('/html/'); // Should save to HTML folder
      expect(writeCall.args[1]).to.include('<html>'); // Should save HTML content
      
      // Verify upload was called with correct parameters  
      const uploadCall = mockDeps.uploadFile.getCall(0);
      expect(uploadCall.args[0]).to.include('/html/'); // Upload path should be HTML file
      expect(uploadCall.args[1]).to.include('admin.da.live'); // Should upload to DA admin
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
      const mockDeps = createMockDependencies();
      mockDeps.getAllFiles.returns([]); // No files

      // Just verify it completes without throwing errors
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

      // Verify getAllFiles was called and returned empty array
      expect(mockDeps.getAllFiles.calledOnce).to.be.true;
      expect(mockDeps.getAllFiles.returnValues[0]).to.deep.equal([]);
    });

    it('should handle missing siteOrigin gracefully', async () => {
      const mockDeps = createMockDependencies();
      mockDeps.fs.readFileSync.returns('<html><body><a href="/page">Link</a></body></html>');

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

      // Verify the page was actually processed successfully
      expect(mockDeps.getAllFiles.calledOnce).to.be.true;
      expect(mockDeps.uploadFile.calledOnce).to.be.true;
      
      // Should complete without throwing errors even with null siteOrigin
    });
  });
});
