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

import {
  isImageAsset,
  createAssetMapping,
  downloadPageAssets,
  uploadPageAssets,
} from '../../src/da/asset-processor.js';
import { IMAGE_EXTENSIONS } from '../../src/utils/download-assets.js';

import { createMockDependencies } from './test-setup.js';

describe('asset-processor.js', () => {
  describe('isImageAsset', () => {
    it('should identify all valid image file extensions', () => {
      // Test all extensions defined in IMAGE_EXTENSIONS
      IMAGE_EXTENSIONS.forEach(ext => {
        const filename = `test${ext}`;
        expect(isImageAsset(filename), `Expected ${filename} to be identified as an image`).to.be.true;
      });
    });

    it('should identify non-image files', () => {
      const nonImageFiles = ['document.pdf', 'video.mp4'];
      nonImageFiles.forEach(filename => {
        expect(isImageAsset(filename), `Expected ${filename} to be identified as non-image`).to.be.false;
      });
    });
  });

  describe('createAssetMapping', () => {
    it('should map image URLs to shadow folder and non-images to shared-media folder', () => {
      const urls = ['https://example.com/image.jpg', 'https://example.com/document.pdf'];
      const mapping = createAssetMapping(urls, 'documents/.mypage');
      
      expect(mapping.get('https://example.com/image.jpg')).to.equal('/documents/.mypage/image.jpg');
      expect(mapping.get('https://example.com/document.pdf')).to.equal('/documents/shared-media/document.pdf');
    });

    it('should handle relative asset URLs', () => {
      const urls = ['local.jpg', 'data.pdf'];
      const mapping = createAssetMapping(urls, '.page');
      
      expect(mapping.get('local.jpg')).to.equal('/.page/local.jpg');
      expect(mapping.get('data.pdf')).to.equal('/shared-media/data.pdf');
    });

    it('should sanitize filenames while preserving extension', () => {
      const urls = ['my file 1.jpg', 'My Document.pdf', 'dog.png.pdf', 'dog.png.jpeg'];
      const mapping = createAssetMapping(urls, '.mypage');
      
      expect(mapping.get('my file 1.jpg')).to.equal('/.mypage/my-file-1.jpg');
      expect(mapping.get('My Document.pdf')).to.equal('/shared-media/my-document.pdf');
      expect(mapping.get('dog.png.pdf')).to.equal('/shared-media/dog-png.pdf');
      expect(mapping.get('dog.png.jpeg')).to.equal('/.mypage/dog-png.jpeg');
    });

    it('should handle empty parent paths', () => {
      const urls = ['foo.jpg', 'document.pdf'];
      const mapping = createAssetMapping(urls, '.page');
      
      // Images go to shadow folder even with empty parent path
      expect(mapping.get('foo.jpg')).to.equal('/.page/foo.jpg');
      // Non-images go to shared-media folder at root level when no parent path
      expect(mapping.get('document.pdf')).to.equal('/shared-media/document.pdf');
    });
  });

  describe('downloadPageAssets', () => {
    it('should download assets and create correct mapping for images and non-images', async () => {
      const deps = createMockDependencies({
        downloadAssets: async () => [
          { status: 'fulfilled' },
          { status: 'fulfilled' },
          { status: 'rejected' },
        ],
      });

      const urls = [
        'https://example.com/image.jpg',      // Image: should go to shadow folder
        'https://example.com/document.pdf',   // Non-image: should go to shared-media folder
        'https://example.com/video.mp4',      // Non-image: should go to shared-media folder
      ];
      const options = { maxRetries: 3, retryDelay: 1000 };
      const result = await downloadPageAssets(urls, 'about/leadership/.executive', '/download', options, deps);
      
      expect(result).to.have.property('downloadResults');
      expect(result).to.have.property('assetMapping');
      expect(result.assetMapping.size).to.equal(3);
      
      // Convert to array for easier testing
      const mappingEntries = Array.from(result.assetMapping.entries());
      const mappingObj = Object.fromEntries(mappingEntries);
      
      // Verify image goes to shadow folder
      expect(mappingObj['https://example.com/image.jpg']).to.equal('/about/leadership/.executive/image.jpg');
      
      // Verify non-images go to shared-media folder under parent
      expect(mappingObj['https://example.com/document.pdf']).to.equal('/about/leadership/shared-media/document.pdf');
      expect(mappingObj['https://example.com/video.mp4']).to.equal('/about/leadership/shared-media/video.mp4');
      
      // Verify download results are returned
      expect(result.downloadResults).to.have.length(3);
      expect(result.downloadResults.filter(r => r.status === 'fulfilled')).to.have.length(2);
      expect(result.downloadResults.filter(r => r.status === 'rejected')).to.have.length(1);
    });
  });

  describe('uploadPageAssets', () => {
    it('should group assets by folder and upload with correct parameters', async () => {
      const uploadCalls = [];
      const logs = [];
      
      const deps = createMockDependencies({
        uploadFolder: async (localFolderPath, daAdminUrl, token, options) => {
          uploadCalls.push({ localFolderPath, daAdminUrl, token, options });
          return { success: true };
        },
        fs: {
          existsSync: () => true, // Simulate all folders exist
        },
        chalk: {
          yellow: (msg) => { logs.push(`YELLOW: ${msg}`); return msg; },
          cyan: (msg) => { logs.push(`CYAN: ${msg}`); return msg; },
          green: (msg) => { logs.push(`GREEN: ${msg}`); return msg; },
          red: (msg) => { logs.push(`RED: ${msg}`); return msg; },
        },
      });
      
      const mapping = new Map([
        ['https://example.com/image1.jpg', '/documents/.page/image1.jpg'],    // Shadow folder
        ['https://example.com/image2.png', '/documents/.page/image2.png'],    // Shadow folder  
        ['https://example.com/doc.pdf', '/documents/shared-media/doc.pdf'],          // Shared-media folder
        ['https://example.com/video.mp4', '/documents/shared-media/video.mp4'],      // Shared-media folder
      ]);

      const uploadOptions = { maxRetries: 5, customOption: 'test' };

      await uploadPageAssets(
        mapping, 
        'https://admin.da.live/source/org/site', 
        'test-token', 
        uploadOptions, 
        '/download', 
        deps,
      );
      
      // Verify assets are grouped by folder (should have 2 folder groups)
      expect(uploadCalls).to.have.length(2);
      
      // Verify shadow folder upload (images)
      const shadowFolderCall = uploadCalls.find(call => 
        call.localFolderPath === '/download/documents/.page',
      );
      expect(shadowFolderCall).to.exist;
      expect(shadowFolderCall.daAdminUrl).to.equal('https://admin.da.live/source/org/site');
      expect(shadowFolderCall.token).to.equal('test-token');
      expect(shadowFolderCall.options).to.deep.equal({
        maxRetries: 5,
        customOption: 'test',
        baseFolder: '/download',
      });
      
      // Verify shared-media folder upload (non-images)
      const mediaFolderCall = uploadCalls.find(call => 
        call.localFolderPath === '/download/documents/shared-media',
      );
      expect(mediaFolderCall).to.exist;
      expect(mediaFolderCall.daAdminUrl).to.equal('https://admin.da.live/source/org/site');
      expect(mediaFolderCall.token).to.equal('test-token');
      expect(mediaFolderCall.options).to.deep.equal({
        maxRetries: 5,
        customOption: 'test',
        baseFolder: '/download',
      });
      
      // Verify logging
      expect(logs).to.include('YELLOW: Uploading assets to 2 different folder(s)...');
      expect(logs).to.include('CYAN: Uploading 2 image(s) from /documents/.page/');
      expect(logs).to.include('CYAN: Uploading 2 non-image asset(s) from /documents/shared-media/');
      expect(logs).to.include('GREEN: Successfully uploaded all page assets');
    });

    it('should handle upload errors properly', async () => {
      const logs = [];
      const uploadError = new Error('Upload failed');
      
      const deps = createMockDependencies({
        uploadFolder: async () => {
          throw uploadError;
        },
        fs: {
          existsSync: () => true,
        },
        chalk: {
          yellow: (msg) => { logs.push(`YELLOW: ${msg}`); return msg; },
          cyan: (msg) => { logs.push(`CYAN: ${msg}`); return msg; },
          green: (msg) => { logs.push(`GREEN: ${msg}`); return msg; },
          red: (msg) => { logs.push(`RED: ${msg}`); return msg; },
        },
      });
      
      const mapping = new Map([['https://example.com/image.jpg', '/test/.page/image.jpg']]);
      
      let thrownError = null;
      try {
        await uploadPageAssets(mapping, 'https://admin.da.live/source/org/site', 'token', {}, '/download', deps);
      } catch (error) {
        thrownError = error;
      }
      
      // Verify error was re-thrown
      expect(thrownError).to.equal(uploadError);
      
      // Verify error logging (should not include success message)
      expect(logs).to.include('YELLOW: Uploading assets to 1 different folder(s)...');
      expect(logs).to.not.include('GREEN: Successfully uploaded all page assets');
    });
  });
});
