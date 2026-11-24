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

    it('detects a JPEG XL codestream and container', function () {
      const codestream = Buffer.from([0xFF, 0x0A, 0x00, 0x00]);
      const container = Buffer.from([0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A, 0x00]);

      expect(detectImageFormat(codestream)).to.equal('JPEG XL');
      expect(detectImageFormat(container)).to.equal('JPEG XL');
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

    it('detects an SVG with a plain DOCTYPE without an internal subset', function () {
      const svgs = [
        '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>',
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
          + '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ];

      for (const svg of svgs) {
        expect(detectImageFormat(Buffer.from(svg)), svg).to.equal('SVG');
      }
    });

    it('does not take an HTML page containing an SVG for an SVG image', function () {
      const pages = [
        '<!DOCTYPE html><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        '<?xml version="1.0"?>\n<!-- page --><html><body><svg></svg></body></html>',
        '<!DOCTYPE x [><html><body><script>alert(1)</script><!-- ]><svg> --></body></html>',
        '<!DOCTYPE svg [><html><body><script>alert(1)</script><!-- ]><svg> --></body></html>',
        '<!DOCTYPE\x00html><svg><script>alert(1)</script></svg>',
      ];

      for (const page of pages) {
        expect(detectImageFormat(Buffer.from(page)), page).to.be.null;
      }
    });

    it('handles SVG namespace prefixes, non-svg element names, control bytes and unterminated prologs', function () {
      expect(detectImageFormat(Buffer.from('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>'))).to.equal('SVG');
      expect(detectImageFormat(Buffer.from('<svgfoo/>'))).to.be.null;
      expect(detectImageFormat(Buffer.from('<svg>\x00</svg>'))).to.be.null;
      expect(detectImageFormat(Buffer.from('<?xml version="1.0"'))).to.be.null;
      expect(detectImageFormat(Buffer.from('<!-- unterminated comment'))).to.be.null;
      expect(detectImageFormat(Buffer.from('<!DOCTYPE svg ['))).to.be.null;
      expect(detectImageFormat(Buffer.from('<!DOCTYPE svg'))).to.be.null;
    });

    it('does not take text, an MP4 video or a truncated header for an image', function () {
      expect(detectImageFormat(Buffer.from('BMW dealers near you'))).to.be.null;
      expect(detectImageFormat(MP4_HEADER)).to.be.null;
      expect(detectImageFormat(Buffer.from('RIFF'))).to.be.null;
      expect(detectImageFormat(Buffer.alloc(0))).to.be.null;
    });

    it('rejects a bare truncated <svg tag while still allowing prologs near the scan limit', function () {
      expect(detectImageFormat(Buffer.from('<svg'))).to.be.null;
      expect(detectImageFormat(Buffer.from('<?xml version="1.0"?><svg'))).to.be.null;

      // Place `<svg` right at the 64 KiB scan boundary so the scanned slice ends right after `<svg`
      const commentOverhead = '<!--  -->'.length;
      const paddingLength = (64 * 1024) - commentOverhead - '<svg'.length;
      const longPrologSvg = Buffer.from(`<!-- ${'a'.repeat(paddingLength)} --><svg xmlns="http://www.w3.org/2000/svg"/>`);
      expect(detectImageFormat(longPrologSvg)).to.equal('SVG');
    });

    it('handles ISO-BMFF ftyp box sizes safely', function () {
      // boxSize === 0 means the box extends to EOF, so compatible brands are read
      const zeroBoxSizeAvif = Buffer.from('\x00\x00\x00\x00ftypisom\x00\x00\x00\x00avif', 'latin1');
      expect(detectImageFormat(zeroBoxSizeAvif)).to.equal('AVIF');

      // boxSize < 16 (other than 0) is invalid
      const tinyBoxSize8 = Buffer.from('\x00\x00\x00\x08ftypavif\x00\x00\x00\x00', 'latin1');
      const tinyBoxSize12 = Buffer.from('\x00\x00\x00\x0Cftypavif\x00\x00\x00\x00', 'latin1');
      expect(detectImageFormat(tinyBoxSize8)).to.be.null;
      expect(detectImageFormat(tinyBoxSize12)).to.be.null;

      // Compatible brands past boxEnd are ignored
      const avifPastBoxEnd = Buffer.from('\x00\x00\x00\x14ftypisom\x00\x00\x00\x00isomavif', 'latin1');
      expect(detectImageFormat(avifPastBoxEnd)).to.be.null;

      // Compatible brands past the 4096-byte scan cap are ignored even with a valid boxSize covering them
      const boxSize = 4100;
      const hugeBoxHeader = Buffer.alloc(16);
      hugeBoxHeader.writeUInt32BE(boxSize, 0);
      hugeBoxHeader.write('ftypisom', 4, 'latin1');
      const hugeBoxWithLateAvif = Buffer.concat([
        hugeBoxHeader,
        Buffer.alloc(4096 - 16, 0x20),
        Buffer.from('avif', 'latin1'),
      ]);
      expect(detectImageFormat(hugeBoxWithLateAvif)).to.be.null;

      // Rejects ftyp boxSize exceeding buffer length, non-multiple-of-4 sizes, and HTML comments
      const oversizedBox = Buffer.from('\x00\x00\x02\x00ftypavif\x00\x00\x00\x00', 'latin1');
      const unalignedBox = Buffer.from('\x00\x00\x00\x12ftypavif\x00\x00\x00\x00\x00\x00', 'latin1');
      const htmlAvif = Buffer.from('<!--ftypavif--><html><body><script>alert(1)</script></body></html>');
      expect(detectImageFormat(oversizedBox)).to.be.null;
      expect(detectImageFormat(unalignedBox)).to.be.null;
      expect(detectImageFormat(htmlAvif)).to.be.null;
    });
  });

  describe('matchesFileKind', function () {
    it('never matches an empty body', function () {
      for (const kind of Object.values(FILE_KIND)) {
        expect(matchesFileKind(Buffer.alloc(0), kind), kind).to.be.false;
      }
    });

    it('keeps raster images and SVG separate', function () {
      const svg = readImageFixture('sample.svg');
      const png = readImageFixture('sample.png');
      expect(matchesFileKind(svg, FILE_KIND.SVG)).to.be.true;
      expect(matchesFileKind(svg, FILE_KIND.IMAGE)).to.be.false;
      expect(matchesFileKind(png, FILE_KIND.IMAGE)).to.be.true;
      expect(matchesFileKind(png, FILE_KIND.SVG)).to.be.false;
    });

    it('matches a PDF whose marker comes after some leading bytes', function () {
      expect(matchesFileKind(Buffer.concat([Buffer.alloc(16, 0x20), Buffer.from('%PDF-1.7\n')]), FILE_KIND.PDF)).to.be.true;
      expect(matchesFileKind(Buffer.from('<html><body>Not found</body></html>'), FILE_KIND.PDF)).to.be.false;
    });

    it('matches an MP4 video by its ftyp box and excludes AVIF, HEIF, unknown brands and HTML/text', function () {
      expect(matchesFileKind(MP4_HEADER, FILE_KIND.VIDEO)).to.be.true;
      expect(matchesFileKind(readImageFixture('sample.jpg'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(readImageFixture('sample.avif'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(readImageFixture('sample.heic'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(readImageFixture('sample.heif'), FILE_KIND.VIDEO)).to.be.false;
      // Real-world AVIF/HEIF containers frequently list `isom` or `mp41` as compatible brands
      const avifWithIsom = Buffer.from('\x00\x00\x00\x18ftypavif\x00\x00\x00\x00avifisom', 'latin1');
      const heicWithMp41 = Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1mp41', 'latin1');
      expect(detectImageFormat(avifWithIsom)).to.equal('AVIF');
      expect(detectImageFormat(heicWithMp41)).to.equal('HEIF');
      expect(matchesFileKind(avifWithIsom, FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(heicWithMp41, FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(Buffer.from('1234ftyp'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(Buffer.from('1234ftyp56789012'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(Buffer.from('<!--ftyp--><html><body>Error</body></html>'), FILE_KIND.VIDEO)).to.be.false;
      expect(matchesFileKind(Buffer.from('\x00\x00\x00\x14ftypXXXX\x00\x00\x00\x00YYYY', 'latin1'), FILE_KIND.VIDEO)).to.be.false;
    });

    it('throws for an unknown kind, including Object.prototype property names', function () {
      expect(() => matchesFileKind(Buffer.from('data'), 'spreadsheet')).to.throw('Unknown file kind: spreadsheet');
      expect(() => matchesFileKind(Buffer.from('data'), 'toString')).to.throw('Unknown file kind: toString');
      expect(() => matchesFileKind(Buffer.from('data'), 'constructor')).to.throw('Unknown file kind: constructor');
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
      expect(describeBytes(Buffer.from('1234ftyp'))).to.equal('plain text of 8 bytes');
      expect(describeBytes(Buffer.from([0x00, 0x01, 0x02, 0x03]))).to.equal('unknown binary data of 4 bytes');
      expect(describeBytes(readImageFixture('sample.webp'))).to.equal('an image (WebP)');
      expect(describeBytes(MP4_HEADER)).to.equal('an MP4 video');
    });
  });
});
