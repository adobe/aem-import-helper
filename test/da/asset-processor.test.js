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
  copyLocalPageAssets,
  uploadPageAssets,
  COPY_STATUS,
} from '../../src/da/asset-processor.js';
import { IMAGE_EXTENSIONS, DOWNLOAD_STATUS } from '../../src/utils/download-assets.js';

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
      
      // Filenames now include hash suffix for uniqueness
      expect(mapping.get('https://example.com/image.jpg')).to.match(/^\/documents\/\.mypage\/image-[a-f0-9]{8}\.jpg$/);
      expect(mapping.get('https://example.com/document.pdf')).to.match(/^\/documents\/shared-media\/document-[a-f0-9]{8}\.pdf$/);
    });

    it('should handle relative asset URLs', () => {
      const urls = ['local.jpg', 'data.pdf'];
      const mapping = createAssetMapping(urls, '.page');
      
      expect(mapping.get('local.jpg')).to.match(/^\/\.page\/local-[a-f0-9]{8}\.jpg$/);
      expect(mapping.get('data.pdf')).to.match(/^\/shared-media\/data-[a-f0-9]{8}\.pdf$/);
    });

    it('should sanitize filenames while preserving extension', () => {
      const urls = ['my file 1.jpg', 'My Document.pdf', 'dog.png.pdf', 'dog.png.jpeg'];
      const mapping = createAssetMapping(urls, '.mypage');
      
      expect(mapping.get('my file 1.jpg')).to.match(/^\/\.mypage\/my-file-1-[a-f0-9]{8}\.jpg$/);
      expect(mapping.get('My Document.pdf')).to.match(/^\/shared-media\/my-document-[a-f0-9]{8}\.pdf$/);
      expect(mapping.get('dog.png.pdf')).to.match(/^\/shared-media\/dog-png-[a-f0-9]{8}\.pdf$/);
      expect(mapping.get('dog.png.jpeg')).to.match(/^\/\.mypage\/dog-png-[a-f0-9]{8}\.jpeg$/);
    });

    it('should handle empty parent paths', () => {
      const urls = ['foo.jpg', 'document.pdf'];
      const mapping = createAssetMapping(urls, '.page');
      
      // Images go to shadow folder even with empty parent path
      expect(mapping.get('foo.jpg')).to.match(/^\/\.page\/foo-[a-f0-9]{8}\.jpg$/);
      // Non-images go to shared-media folder at root level when no parent path
      expect(mapping.get('document.pdf')).to.match(/^\/shared-media\/document-[a-f0-9]{8}\.pdf$/);
    });
  });

  describe('downloadPageAssets', () => {
    it('should download assets and create correct mapping for images and non-images', async () => {
      const deps = createMockDependencies({
        downloadAssets: async () => [
          { status: DOWNLOAD_STATUS.FULFILLED },
          { status: DOWNLOAD_STATUS.FULFILLED },
          { status: DOWNLOAD_STATUS.REJECTED },
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
      
      // Verify image goes to shadow folder (with hash suffix)
      expect(mappingObj['https://example.com/image.jpg']).to.match(/^\/about\/leadership\/\.executive\/image-[a-f0-9]{8}\.jpg$/);
      
      // Verify non-images go to shared-media folder under parent (with hash suffix)
      expect(mappingObj['https://example.com/document.pdf']).to.match(/^\/about\/leadership\/shared-media\/document-[a-f0-9]{8}\.pdf$/);
      expect(mappingObj['https://example.com/video.mp4']).to.match(/^\/about\/leadership\/shared-media\/video-[a-f0-9]{8}\.mp4$/);
      
      // Verify download results are returned
      expect(result.downloadResults).to.have.length(3);
      expect(result.downloadResults.filter(r => r.status === DOWNLOAD_STATUS.FULFILLED)).to.have.length(2);
      expect(result.downloadResults.filter(r => r.status === DOWNLOAD_STATUS.REJECTED)).to.have.length(1);
    });
  });

  describe('copyLocalPageAssets', () => {
    it('should copy images to shadow folder and PDFs to shared-media with correct paths', async () => {
      const copiedFiles = [];
      
      const deps = createMockDependencies({
        fs: {
          existsSync: (path) => path.includes('local-assets'),
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      const urls = [
        './team/photo.jpg',
        '/documents/resume.pdf',
      ];
      
      const result = await copyLocalPageAssets(
        urls,
        'about/leadership/.executive',
        '/download',
        '/local-assets',
        {},  // options
        deps,
      );
      
      expect(copiedFiles).to.have.length(2);
      
      // Find the image and PDF copies
      const imageCopy = copiedFiles.find(f => f.src.includes('photo.jpg'));
      const pdfCopy = copiedFiles.find(f => f.src.includes('resume.pdf'));
      
      // Verify source paths are constructed correctly from URLs
      // Asset references are relative to --local-assets folder
      expect(imageCopy.src).to.equal('/local-assets/team/photo.jpg');
      expect(pdfCopy.src).to.equal('/local-assets/documents/resume.pdf');
      
      // Verify image goes to shadow folder
      expect(imageCopy.dest).to.match(/\/download\/about\/leadership\/\.executive\/photo-[a-f0-9]{8}\.jpg$/);
      
      // Verify PDF goes to shared-media under parent directory
      expect(pdfCopy.dest).to.match(/\/download\/about\/leadership\/shared-media\/resume-[a-f0-9]{8}\.pdf$/);
      
      // Verify mapping matches the destinations (keys are original URLs)
      const mappingEntries = Array.from(result.assetMapping.entries());
      expect(mappingEntries[0][0]).to.equal('./team/photo.jpg');
      expect(mappingEntries[0][1]).to.match(/^\/about\/leadership\/\.executive\/photo-[a-f0-9]{8}\.jpg$/);
      expect(mappingEntries[1][0]).to.equal('/documents/resume.pdf');
      expect(mappingEntries[1][1]).to.match(/^\/about\/leadership\/shared-media\/resume-[a-f0-9]{8}\.pdf$/);
    });

    it('should handle missing local assets and continue with others', async () => {
      const copiedFiles = [];
      
      const deps = createMockDependencies({
        fs: {
          existsSync: (path) => {
            // Only the image exists, not the PDF
            return path.includes('photo.jpg');
          },
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      const urls = ['./team/photo.jpg', '/docs/missing.pdf'];
      
      const result = await copyLocalPageAssets(
        urls,
        '.page',
        '/download',
        '/local-assets',
        {},  // options
        deps,
      );
      
      // Should have 2 results: 1 success, 1 failure
      expect(result.copyResults).to.have.length(2);
      expect(result.copyResults.filter(r => r.status === COPY_STATUS.SUCCESS)).to.have.length(1);
      expect(result.copyResults.filter(r => r.status === COPY_STATUS.ERROR)).to.have.length(1);
      
      // Only the existing file should be copied
      expect(copiedFiles).to.have.length(1);
      // Asset path is relative to --local-assets folder
      expect(copiedFiles[0].src).to.equal('/local-assets/team/photo.jpg');
    });

    it('should strip http/https protocols from localhost URLs correctly', async () => {
      const copiedFiles = [];
      
      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      const urls = [
        'http://localhost:3000/assets/logo.png',
        'https://localhost:8080/media/video.mp4',
      ];
      
      await copyLocalPageAssets(
        urls,
        '.homepage',
        '/output',
        '/my-assets',
        {},  // options
        deps,
      );
      
      expect(copiedFiles).to.have.length(2);
      
      // Verify protocols were stripped and paths correctly constructed relative to --local-assets
      expect(copiedFiles[0].src).to.equal('/my-assets/assets/logo.png');
      expect(copiedFiles[1].src).to.equal('/my-assets/media/video.mp4');
      
      // Verify image goes to shadow folder, video goes to shared-media
      expect(copiedFiles[0].dest).to.match(/\/output\/\.homepage\/logo-[a-f0-9]{8}\.png$/);
      expect(copiedFiles[1].dest).to.match(/\/output\/shared-media\/video-[a-f0-9]{8}\.mp4$/);
    });

    it('should strip redundant directory prefix when it matches local assets folder name', async () => {
      const copiedFiles = [];
      
      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
      });

      const urls = [
        './images/home/icon-social.png',
        './images/logos/brand.svg',
      ];
      
      await copyLocalPageAssets(
        urls,
        '.index',
        '/output',
        '/data/images',  // local assets folder ends with "images"
        {},  // options
        deps,
      );
      
      expect(copiedFiles).to.have.length(2);
      
      // Verify the "images/" prefix was stripped to avoid /data/images/images/...
      expect(copiedFiles[0].src).to.equal('/data/images/home/icon-social.png');
      expect(copiedFiles[1].src).to.equal('/data/images/logos/brand.svg');
    });

    it('should route different file types correctly: images to shadow folder, PDFs to shared-media', async () => {
      const copiedFiles = [];
      
      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      // Simulate this folder structure:
      // /local/assets/
      // ├── hero/banner.jpg
      // ├── team/john-smith.png
      // └── documents/brochure.pdf
      const urls = [
        './hero/banner.jpg',           // Image → shadow folder
        './team/john-smith.png',       // Image → shadow folder
        './documents/brochure.pdf',    // PDF → shared-media folder
      ];
      
      const result = await copyLocalPageAssets(
        urls,
        'about/team/.leadership',  // Page path: about/team/leadership.html
        '/output',
        '/local/assets',
        {},  // options
        deps,
      );
      
      expect(copiedFiles).to.have.length(3);
      expect(result.copyResults.filter(r => r.status === COPY_STATUS.SUCCESS)).to.have.length(3);
      
      // Find each copied file
      const bannerCopy = copiedFiles.find(f => f.src.includes('banner.jpg'));
      const teamCopy = copiedFiles.find(f => f.src.includes('john-smith.png'));
      const pdfCopy = copiedFiles.find(f => f.src.includes('brochure.pdf'));
      
      // Verify source paths
      expect(bannerCopy.src).to.equal('/local/assets/hero/banner.jpg');
      expect(teamCopy.src).to.equal('/local/assets/team/john-smith.png');
      expect(pdfCopy.src).to.equal('/local/assets/documents/brochure.pdf');
      
      // Verify images go to shadow folder (.leadership)
      expect(bannerCopy.dest).to.match(/\/output\/about\/team\/\.leadership\/banner-[a-f0-9]{8}\.jpg$/);
      expect(teamCopy.dest).to.match(/\/output\/about\/team\/\.leadership\/john-smith-[a-f0-9]{8}\.png$/);
      
      // Verify PDF goes to shared-media folder under the parent directory (about/team)
      expect(pdfCopy.dest).to.match(/\/output\/about\/team\/shared-media\/brochure-[a-f0-9]{8}\.pdf$/);
      
      // Verify the asset mapping reflects the correct target paths
      const mappingEntries = Array.from(result.assetMapping.entries());
      const jpgMapping = mappingEntries.find(e => e[0] === './hero/banner.jpg');
      const pngMapping = mappingEntries.find(e => e[0] === './team/john-smith.png');
      const pdfMapping = mappingEntries.find(e => e[0] === './documents/brochure.pdf');
      
      expect(jpgMapping[1]).to.match(/^\/about\/team\/\.leadership\/banner-[a-f0-9]{8}\.jpg$/);
      expect(pngMapping[1]).to.match(/^\/about\/team\/\.leadership\/john-smith-[a-f0-9]{8}\.png$/);
      expect(pdfMapping[1]).to.match(/^\/about\/team\/shared-media\/brochure-[a-f0-9]{8}\.pdf$/);
    });

    it('should convert webp images to PNG when imagesToPng is enabled', async () => {
      const copiedFiles = [];
      const convertedFiles = [];

      // Mock Sharp conversion
      // eslint-disable-next-line no-unused-vars
      const mockSharp = (buffer) => ({
        png: () => ({
          toBuffer: async () => {
            convertedFiles.push('converted');
            return Buffer.from('fake-png-data');
          },
        }),
      });

      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          // eslint-disable-next-line no-unused-vars
          readFileSync: (path) => Buffer.from('fake-webp-data'),
          writeFileSync: (dest, buffer) => {
            copiedFiles.push({ dest, buffer });
          },
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
        sharp: mockSharp,
      });

      const urls = [
        './images/hero.webp',
        './images/banner.avif',
      ];

      const result = await copyLocalPageAssets(
        urls,
        '.index',
        '/output',
        '/local-assets',
        { imagesToPng: true },
        deps,
      );

      expect(result.copyResults).to.have.length(2);
      expect(result.copyResults.filter(r => r.status === COPY_STATUS.SUCCESS)).to.have.length(2);

      // Verify files were converted (writeFileSync called, not copyFileSync)
      expect(copiedFiles).to.have.length(2);

      // Verify the destinations have .png extensions
      expect(copiedFiles[0].dest).to.match(/\/output\/\.index\/hero-[a-f0-9]{8}\.png$/);
      expect(copiedFiles[1].dest).to.match(/\/output\/\.index\/banner-[a-f0-9]{8}\.png$/);

      // Verify conversion actually happened
      expect(convertedFiles).to.have.length(2);
    });

    it('should NOT convert images when imagesToPng is false', async () => {
      const copiedFiles = [];

      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      const urls = ['./images/hero.webp'];

      await copyLocalPageAssets(
        urls,
        '.index',
        '/output',
        '/local-assets',
        { imagesToPng: false },
        deps,
      );

      expect(copiedFiles).to.have.length(1);

      // Verify file was copied as-is with original extension
      expect(copiedFiles[0].dest).to.match(/\/output\/\.index\/hero-[a-f0-9]{8}\.webp$/);
    });

    it('should NOT convert jpg/png/gif/svg images even when imagesToPng is true', async () => {
      const copiedFiles = [];

      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest });
          },
        },
        chalk: {
          yellow: (msg) => msg,
          green: (msg) => msg,
          red: (msg) => msg,
        },
      });

      const urls = [
        './images/photo.jpg',
        './images/logo.png',
        './images/animation.gif',
        './images/icon.svg',
      ];

      await copyLocalPageAssets(
        urls,
        '.index',
        '/output',
        '/local-assets',
        { imagesToPng: true },
        deps,
      );

      expect(copiedFiles).to.have.length(4);

      // Verify files keep their original extensions
      expect(copiedFiles[0].dest).to.match(/\/output\/\.index\/photo-[a-f0-9]{8}\.jpg$/);
      expect(copiedFiles[1].dest).to.match(/\/output\/\.index\/logo-[a-f0-9]{8}\.png$/);
      expect(copiedFiles[2].dest).to.match(/\/output\/\.index\/animation-[a-f0-9]{8}\.gif$/);
      expect(copiedFiles[3].dest).to.match(/\/output\/\.index\/icon-[a-f0-9]{8}\.svg$/);
    });

    it('should fall back to copying original file when conversion fails', async () => {
      const copiedFiles = [];
      const logs = [];

      // Mock Sharp that fails
      const mockSharp = () => ({
        png: () => ({
          toBuffer: async () => {
            throw new Error('Conversion failed');
          },
        }),
      });

      const deps = createMockDependencies({
        fs: {
          existsSync: () => true,
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('fake-webp-data'),
          copyFileSync: (src, dest) => {
            copiedFiles.push({ src, dest, method: 'copy' });
          },
          writeFileSync: (dest, buffer) => {
            copiedFiles.push({ dest, buffer, method: 'write' });
          },
        },
        chalk: {
          yellow: (msg) => { logs.push(`YELLOW: ${msg}`); return msg; },
          green: (msg) => { logs.push(`GREEN: ${msg}`); return msg; },
          red: (msg) => { logs.push(`RED: ${msg}`); return msg; },
        },
        sharp: mockSharp,
      });

      const urls = ['./images/hero.webp'];

      const result = await copyLocalPageAssets(
        urls,
        '.index',
        '/output',
        '/local-assets',
        { imagesToPng: true },
        deps,
      );

      // Should still succeed, but with original file
      expect(result.copyResults).to.have.length(1);
      expect(result.copyResults[0].status).to.equal(COPY_STATUS.SUCCESS);

      // Verify fallback to copy
      expect(copiedFiles).to.have.length(1);
      expect(copiedFiles[0].method).to.equal('copy');

      // Verify warning was logged
      expect(logs.some(log => log.includes('Failed to convert'))).to.be.true;
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
