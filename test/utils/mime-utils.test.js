/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from 'chai';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectMimeType, addExtensionsToFiles } from '../../src/utils/mime-utils.js';

describe('mime-utils', function () {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mime-utils-test-'));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('detectMimeType', function () {
    // Formats not covered by fixture files (no real file available)
    it('should detect GIF87a from magic bytes', async function () {
      const filePath = path.join(tmpDir, 'image');
      fs.writeFileSync(filePath, Buffer.from('GIF87a\x00\x00\x00\x00'));

      const result = await detectMimeType(filePath);
      expect(result).to.not.be.null;
      expect(result.mime).to.equal('image/gif');
      expect(result.ext).to.equal('.gif');
    });

    it('should detect TIFF (big-endian) from magic bytes', async function () {
      const filePath = path.join(tmpDir, 'image');
      fs.writeFileSync(filePath, Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00]));

      const result = await detectMimeType(filePath);
      expect(result).to.not.be.null;
      expect(result.mime).to.equal('image/tiff');
      expect(result.ext).to.equal('.tiff');
    });

    it('should detect PDF from magic bytes', async function () {
      const filePath = path.join(tmpDir, 'document');
      fs.writeFileSync(filePath, Buffer.from('%PDF-1.7\n'));

      const result = await detectMimeType(filePath);
      expect(result).to.not.be.null;
      expect(result.mime).to.equal('application/pdf');
      expect(result.ext).to.equal('.pdf');
    });

    // Edge cases
    it('should return null for empty file', async function () {
      const filePath = path.join(tmpDir, 'empty');
      fs.writeFileSync(filePath, '');

      const result = await detectMimeType(filePath);
      expect(result).to.be.null;
    });

    it('should return null for unrecognized content', async function () {
      const filePath = path.join(tmpDir, 'unknown');
      fs.writeFileSync(filePath, 'This is just plain text content.');

      const result = await detectMimeType(filePath);
      expect(result).to.be.null;
    });
  });

  describe('detectMimeType with real fixture files', function () {
    const fixturesDir = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '..', 'fixtures', 'images',
    );

    const expectedResults = [
      { file: 'sample.png', mime: 'image/png', ext: '.png' },
      { file: 'sample.jpg', mime: 'image/jpeg', ext: '.jpg' },
      { file: 'sample.gif', mime: 'image/gif', ext: '.gif' },
      { file: 'sample.bmp', mime: 'image/bmp', ext: '.bmp' },
      { file: 'sample.ico', mime: 'image/x-icon', ext: '.ico' },
      { file: 'sample.tiff', mime: 'image/tiff', ext: '.tiff' },
      { file: 'sample.webp', mime: 'image/webp', ext: '.webp' },
      { file: 'sample.avif', mime: 'image/avif', ext: '.avif' },
      { file: 'sample-avis.avif', mime: 'image/avif', ext: '.avif' },
      { file: 'sample.heic', mime: 'image/heic', ext: '.heic' },
      { file: 'sample-heix.heic', mime: 'image/heic', ext: '.heic' },
      { file: 'sample.heif', mime: 'image/heif', ext: '.heif' },
      { file: 'sample.svg', mime: 'image/svg+xml', ext: '.svg' },
      { file: 'sample-xml.svg', mime: 'image/svg+xml', ext: '.svg' },
    ];

    for (const { file, mime, ext } of expectedResults) {
      it(`should detect ${file} as ${mime}`, async function () {
        const result = await detectMimeType(path.join(fixturesDir, file));
        expect(result).to.not.be.null;
        expect(result.mime).to.equal(mime);
        expect(result.ext).to.equal(ext);
      });
    }
  });

  describe('addExtensionsToFiles', function () {
    it('should rename extensionless files with detected extensions', async function () {
      // Create a JPEG file without extension
      const jpegPath = path.join(tmpDir, 'photo');
      fs.writeFileSync(jpegPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]));

      // Create a PNG file without extension
      const pngPath = path.join(tmpDir, 'icon');
      fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]));

      const renamedMap = await addExtensionsToFiles(tmpDir);

      expect(renamedMap).to.be.an.instanceOf(Map);
      expect(renamedMap.size).to.equal(2);
      expect(renamedMap.get(jpegPath)).to.equal(path.join(tmpDir, 'photo.jpg'));
      expect(renamedMap.get(pngPath)).to.equal(path.join(tmpDir, 'icon.png'));
      expect(fs.existsSync(path.join(tmpDir, 'photo.jpg'))).to.be.true;
      expect(fs.existsSync(path.join(tmpDir, 'icon.png'))).to.be.true;
      // Originals should no longer exist
      expect(fs.existsSync(jpegPath)).to.be.false;
      expect(fs.existsSync(pngPath)).to.be.false;
    });

    it('should not rename files that already have extensions', async function () {
      const filePath = path.join(tmpDir, 'photo.jpg');
      fs.writeFileSync(filePath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]));

      const renamedMap = await addExtensionsToFiles(tmpDir);

      expect(renamedMap.size).to.equal(0);
      expect(fs.existsSync(filePath)).to.be.true;
    });

    it('should not rename extensionless files with unrecognized content', async function () {
      const filePath = path.join(tmpDir, 'textfile');
      fs.writeFileSync(filePath, 'Just plain text');

      const renamedMap = await addExtensionsToFiles(tmpDir);

      expect(renamedMap.size).to.equal(0);
      expect(fs.existsSync(filePath)).to.be.true;
    });

    it('should handle nested directories recursively', async function () {
      const subDir = path.join(tmpDir, 'subdir');
      fs.mkdirSync(subDir);

      // File in root
      const rootImagePath = path.join(tmpDir, 'rootimage');
      fs.writeFileSync(
        rootImagePath,
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]),
      );

      // File in subdirectory
      const subImagePath = path.join(subDir, 'subimage');
      fs.writeFileSync(
        subImagePath,
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]),
      );

      const renamedMap = await addExtensionsToFiles(tmpDir);

      expect(renamedMap.size).to.equal(2);
      expect(renamedMap.get(rootImagePath)).to.equal(path.join(tmpDir, 'rootimage.jpg'));
      expect(renamedMap.get(subImagePath)).to.equal(path.join(subDir, 'subimage.png'));
      expect(fs.existsSync(path.join(tmpDir, 'rootimage.jpg'))).to.be.true;
      expect(fs.existsSync(path.join(subDir, 'subimage.png'))).to.be.true;
    });

    it('should handle mixed files (with and without extensions)', async function () {
      // File with extension — should not be touched
      fs.writeFileSync(
        path.join(tmpDir, 'existing.png'),
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]),
      );

      // File without extension — should be renamed
      const newfilePath = path.join(tmpDir, 'newfile');
      fs.writeFileSync(newfilePath, Buffer.from('%PDF-1.7\n'));

      // File without extension, unrecognized — should not be touched
      fs.writeFileSync(
        path.join(tmpDir, 'mystery'),
        'unknown content',
      );

      const renamedMap = await addExtensionsToFiles(tmpDir);

      expect(renamedMap.size).to.equal(1);
      expect(renamedMap.get(newfilePath)).to.equal(path.join(tmpDir, 'newfile.pdf'));
      expect(fs.existsSync(path.join(tmpDir, 'existing.png'))).to.be.true;
      expect(fs.existsSync(path.join(tmpDir, 'newfile.pdf'))).to.be.true;
      expect(fs.existsSync(path.join(tmpDir, 'mystery'))).to.be.true;
    });

    it('should return empty map for empty directory', async function () {
      const renamedMap = await addExtensionsToFiles(tmpDir);
      expect(renamedMap).to.be.an.instanceOf(Map);
      expect(renamedMap.size).to.equal(0);
    });
  });
});
