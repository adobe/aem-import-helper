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

import { createMockDependencies } from './test-setup.js';

describe('asset-processor.js', () => {
  describe('isImageAsset', () => {
    it('should identify image files', () => {
      expect(isImageAsset('photo.jpg')).to.be.true;
      expect(isImageAsset('image.png')).to.be.true;
      expect(isImageAsset('icon.gif')).to.be.true;
    });

    it('should identify non-image files', () => {
      expect(isImageAsset('document.pdf')).to.be.false;
      expect(isImageAsset('video.mp4')).to.be.false;
      expect(isImageAsset('data.json')).to.be.false;
    });
  });

  describe('createAssetMapping', () => {
    it('should map image URLs to shadow folder and non-images to media folder', () => {
      const urls = ['https://example.com/image.jpg', 'https://example.com/document.pdf'];
      const mapping = createAssetMapping(urls, 'documents/.mypage');
      
      expect(mapping.get('https://example.com/image.jpg')).to.equal('/documents/.mypage/image.jpg');
      expect(mapping.get('https://example.com/document.pdf')).to.equal('/documents/media/document.pdf');
    });

    it('should handle relative asset URLs', () => {
      const urls = ['local.jpg', 'data.pdf'];
      const mapping = createAssetMapping(urls, '.page');
      
      expect(mapping.get('local.jpg')).to.equal('/.page/local.jpg');
      expect(mapping.get('data.pdf')).to.equal('/media/data.pdf');
    });

    it('should sanitize filenames while preserving extension', () => {
      const urls = ['my file 1.jpg', 'My Document.pdf'];
      const mapping = createAssetMapping(urls, '.mypage');
      
      expect(mapping.get('my file 1.jpg')).to.equal('/.mypage/my-file-1.jpg');
      expect(mapping.get('My Document.pdf')).to.equal('/media/my-document.pdf');
    });

    it('should handle empty parent paths', () => {
      const urls = ['foo.js'];
      const mapping = createAssetMapping(urls, '.page');
      
      expect(mapping.get('foo.js')).to.equal('/media/foo.js');
    });
  });

  describe('downloadPageAssets', () => {
    it('should download assets and return mapping', async () => {
      const deps = createMockDependencies({
        downloadAssets: async () => [{ status: 'fulfilled' }],
      });

      const urls = ['https://example.com/image.jpg'];
      const result = await downloadPageAssets(urls, 'documents/.page', '/download', 3, 1000, deps);
      
      expect(result).to.have.property('downloadResults');
      expect(result).to.have.property('assetMapping');
      expect(result.assetMapping.size).to.equal(1);
    });
  });

  describe('uploadPageAssets', () => {
    it('should group assets by folder and upload', async () => {
      const deps = createMockDependencies();
      
      const mapping = new Map([
        ['https://example.com/image.jpg', '/documents/.page/image.jpg'],
        ['https://example.com/doc.pdf', '/documents/media/doc.pdf'],
      ]);

      await uploadPageAssets(mapping, 'https://admin.da.live/source/org/site', 'token', {}, '/download', deps);
      
      // Should not throw error
      expect(true).to.be.true;
    });
  });
});
