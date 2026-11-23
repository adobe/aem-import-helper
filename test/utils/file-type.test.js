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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_KIND, describeBytes, detectImageFormat, matchesFileKind } from '../../src/utils/file-type.js';
import { IMAGE_EXTENSIONS } from '../../src/utils/download-assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readImageFixture = (name) => fs.readFileSync(path.resolve(__dirname, '../fixtures/images', name));

const MP4_HEADER = Buffer.from('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom', 'latin1');

describe('file-type', function () {
  describe('detectImageFormat', function () {
    it('detects the format of each image fixture', function () {
      const expectedFormats = {
        'sample.png': 'PNG',
        'sample.jpg': 'JPEG',
        'sample.gif': 'GIF',
        'sample.webp': 'WebP',
        'sample.avif': 'AVIF',
        'sample-avis.avif': 'AVIF',
        'sample.heic': 'HEIF',
        'sample-heix.heic': 'HEIF',
        'sample.heif': 'HEIF',
        'sample.bmp': 'BMP',
        'sample.tiff': 'TIFF',
        'sample.ico': 'ICO',
        'sample.svg': 'SVG',
        'sample-xml.svg': 'SVG',
      };

      for (const [name, format] of Object.entries(expectedFormats)) {
        expect(detectImageFormat(readImageFixture(name)), name).to.equal(format);
      }
    });

    it('recognises an image of every extension downloads are saved under as images', function () {
      const samples = {
        '.jpg': 'sample.jpg',
        '.jpeg': 'sample.jpg',
        '.png': 'sample.png',
        '.apng': 'sample.png',
        '.gif': 'sample.gif',
        '.webp': 'sample.webp',
        '.svg': 'sample.svg',
        '.tiff': 'sample.tiff',
        '.bmp': 'sample.bmp',
        '.ico': 'sample.ico',
        '.heic': 'sample.heic',
        '.heif': 'sample.heif',
        '.avif': 'sample.avif',
      };

      for (const ext of IMAGE_EXTENSIONS) {
        expect(samples, `sample image for ${ext}`).to.have.property(ext);
        expect(detectImageFormat(readImageFixture(samples[ext])), ext).to.not.be.null;
      }
    });

    it('detects a JPEG 2000 codestream and JP2 container', function () {
      const codestream = Buffer.from([0xFF, 0x4F, 0xFF, 0x51, 0x00, 0x2F]);
      const container = Buffer.from([0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A, 0x00]);

      expect(detectImageFormat(codestream)).to.equal('JPEG 2000');
      expect(detectImageFormat(container)).to.equal('JPEG 2000');
    });

    it('detects an SVG that starts with a BOM, an XML declaration, a comment and a doctype', function () {
      const svg = '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<!-- Generator: Adobe Illustrator 28.0.0, SVG Export Plug-In -->\n'
        + '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n'
        + '  <!ENTITY ns_svg "http://www.w3.org/2000/svg">\n'
        + ']>\n'
        + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';

      expect(detectImageFormat(Buffer.from(svg))).to.equal('SVG');
    });

    it('does not take an HTML page containing an SVG for an SVG image', function () {
      const pages = [
        '<!DOCTYPE html><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        '<?xml version="1.0"?>\n<!-- page --><html><body><svg></svg></body></html>',
      ];

      for (const page of pages) {
        expect(detectImageFormat(Buffer.from(page)), page).to.be.null;
      }
    });

    it('does not take text, an MP4 video or a truncated header for an image', function () {
      expect(detectImageFormat(Buffer.from('BMW dealers near you'))).to.be.null;
      expect(detectImageFormat(MP4_HEADER)).to.be.null;
      expect(detectImageFormat(Buffer.from('RIFF'))).to.be.null;
      expect(detectImageFormat(Buffer.alloc(0))).to.be.null;
    });
  });

  describe('matchesFileKind', function () {
    it('never matches an empty body', function () {
      for (const kind of Object.values(FILE_KIND)) {
        expect(matchesFileKind(Buffer.alloc(0), kind), kind).to.be.false;
      }
    });

    it('matches a PDF whose marker comes after some leading bytes', function () {
      expect(matchesFileKind(Buffer.concat([Buffer.alloc(16, 0x20), Buffer.from('%PDF-1.7\n')]), FILE_KIND.PDF)).to.be.true;
      expect(matchesFileKind(Buffer.from('<html><body>Not found</body></html>'), FILE_KIND.PDF)).to.be.false;
    });

    it('matches an MP4 video by its ftyp box', function () {
      expect(matchesFileKind(MP4_HEADER, FILE_KIND.VIDEO)).to.be.true;
      expect(matchesFileKind(readImageFixture('sample.jpg'), FILE_KIND.VIDEO)).to.be.false;
    });

    it('throws for an unknown kind', function () {
      expect(() => matchesFileKind(Buffer.from('data'), 'spreadsheet')).to.throw('Unknown file kind: spreadsheet');
    });
  });

  describe('describeBytes', function () {
    it('describes what a body looks like', function () {
      expect(describeBytes(Buffer.alloc(0))).to.equal('empty');
      expect(describeBytes(Buffer.from('\n  <!doctype html><html lang="en"></html>'))).to.equal('an HTML page');
      expect(describeBytes(Buffer.from('<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>')))
        .to.equal('an XML document');
      expect(describeBytes(Buffer.from('{"error":"not found"}'))).to.equal('JSON');
      expect(describeBytes(Buffer.from('Not Found'))).to.equal('plain text of 9 bytes');
      expect(describeBytes(Buffer.from([0x00, 0x01, 0x02, 0x03]))).to.equal('unknown binary data of 4 bytes');
      expect(describeBytes(readImageFixture('sample.webp'))).to.equal('an image (WebP)');
      expect(describeBytes(MP4_HEADER)).to.equal('an MP4 video');
    });
  });
});
