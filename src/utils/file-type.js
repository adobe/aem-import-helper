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

/**
 * Kinds of file whose bytes can be checked with matchesFileKind.
 */
export const FILE_KIND = Object.freeze({
  IMAGE: 'image',
  SVG: 'svg',
  PDF: 'pdf',
  VIDEO: 'video',
});

/**
 * Image signatures found at a fixed offset.
 */
const IMAGE_SIGNATURES = [
  // PNG, and APNG which shares its signature
  { format: 'PNG', offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { format: 'JPEG', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { format: 'GIF', offset: 0, bytes: 'GIF87a' },
  { format: 'GIF', offset: 0, bytes: 'GIF89a' },
  { format: 'TIFF', offset: 0, bytes: [0x49, 0x49, 0x2A, 0x00] },
  { format: 'TIFF', offset: 0, bytes: [0x4D, 0x4D, 0x00, 0x2A] },
  // BigTIFF
  { format: 'TIFF', offset: 0, bytes: [0x49, 0x49, 0x2B, 0x00] },
  { format: 'TIFF', offset: 0, bytes: [0x4D, 0x4D, 0x00, 0x2B] },
  { format: 'ICO', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
  // JPEG XL codestream and container
  { format: 'JPEG XL', offset: 0, bytes: [0xFF, 0x0A] },
  { format: 'JPEG XL', offset: 0, bytes: [0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A] },
  // JPEG 2000 codestream and container (JP2), which some image servers send as image/jp2
  { format: 'JPEG 2000', offset: 0, bytes: [0xFF, 0x4F, 0xFF, 0x51] },
  { format: 'JPEG 2000', offset: 0, bytes: [0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A] },
].map((signature) => ({ ...signature, bytes: Buffer.from(signature.bytes) }));

const RIFF = Buffer.from('RIFF');
const WEBP = Buffer.from('WEBP');
const FTYP = Buffer.from('ftyp');

// ISO-BMFF brands of AVIF and HEIF/HEIC images and image sequences
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);
// ISO-BMFF brands used by MP4, QuickTime, 3GP and DASH video files
const MP4_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9',
  'mp41', 'mp42', 'mp71',
  'avc1', 'av01', 'hvc1', 'hev1', 'vp09', 'dby1',
  'M4V ', 'M4VH', 'M4VP', 'M4A ', 'M4B ', 'f4v ', 'f4p ',
  'dash', 'dsms', 'msdh', 'msix', 'lmsg', 'cmfc', 'cmf2', 'piff',
  'qt  ', '3gp4', '3gp5', '3gp6', '3gp7', '3gp8', '3gp9', '3g2a', '3g2b', '3g2c',
]);

// Cap how far into an ISO-BMFF `ftyp` box we scan for compatible brands
const FTYP_SCAN_LIMIT = 4096;

// Size of the DIB header that follows the 14 byte BMP file header, one per BMP header version
const BMP_DIB_HEADER_SIZES = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

// SVG files can start with a long comment (licence, generator), so look further than the first block
const SVG_SCAN_LIMIT = 64 * 1024;

// Bytes looked at to describe a download that is not the expected kind of file
const DESCRIBE_SAMPLE_SIZE = 1024;

const PDF_MARKER = '%PDF-';
const PDF_SCAN_LIMIT = 1024;

const HTML_PATTERN = /<!doctype\s+html|<(?:html|head|body|title|script|meta)[\s/>]/;

/**
 * Check whether the given bytes contain the signature at the given offset.
 * @param {Buffer} bytes - The bytes to check.
 * @param {Buffer} signature - The signature to look for.
 * @param {number} offset - The offset at which the signature must start.
 * @return {boolean} True when the signature is found at the offset.
 */
function hasBytesAt(bytes, signature, offset) {
  return bytes.length >= offset + signature.length
    && bytes.subarray(offset, offset + signature.length).equals(signature);
}

/**
 * Get the major and compatible brands of an ISO-BMFF `ftyp` box at the start of the bytes.
 * @param {Buffer} bytes - The bytes to read.
 * @return {string[]} The brands, or an empty array when the bytes do not start with an `ftyp` box.
 */
function getFtypBrands(bytes) {
  if (!bytes || bytes.length < 16 || !hasBytesAt(bytes, FTYP, 4)) {
    return [];
  }
  const boxSize = bytes.readUInt32BE(0);
  if (boxSize !== 0 && (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0)) {
    return [];
  }
  const brands = [bytes.toString('latin1', 8, 12)];
  // Compatible brands follow the major brand (8) and the minor version (12);
  // a box size of 0 means the box extends to the end of the file
  const boxEnd = Math.min(bytes.length, FTYP_SCAN_LIMIT, boxSize === 0 ? FTYP_SCAN_LIMIT : boxSize);
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(bytes.toString('latin1', offset, offset + 4));
  }
  return brands;
}

/**
 * Scan past a quoted XML string or non-angle-bracket characters until `>` (or `[` when allowed).
 * @param {string} text - The text to scan.
 * @param {number} start - The starting index.
 * @param {boolean} allowBracket - Whether `[` terminates the scan.
 * @return {number} The index of the terminator (`>` or `[`), or -1 on malformed input / EOF.
 */
function scanXmlMarkupEnd(text, start, allowBracket) {
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === '\'') {
      quote = ch;
    } else if (ch === '>' || (allowBracket && ch === '[')) {
      return i;
    } else if (ch === '<') {
      return -1;
    }
  }
  return -1;
}

/**
 * Skip an XML DOCTYPE declaration whose root element is `svg`, validating any `[...]` internal
 * subset so HTML5 polyglots (e.g. `<!DOCTYPE svg [><html>...`) are rejected.
 * @param {string} rest - The document text starting at `<!DOCTYPE`.
 * @return {string|null} The text after the DOCTYPE, or null when invalid or unterminated.
 */
function skipSvgDoctype(rest) {
  const match = /^<!doctype\s+svg(?=[\s[>])/i.exec(rest);
  if (!match) {
    return null;
  }
  const headerEnd = scanXmlMarkupEnd(rest, match[0].length, true);
  if (headerEnd === -1) {
    return null;
  }
  if (rest[headerEnd] === '>') {
    return rest.slice(headerEnd + 1);
  }

  // Parse the DTD internal subset between `[` and `]`
  let pos = headerEnd + 1;
  while (pos < rest.length) {
    while (pos < rest.length && (rest[pos] === ' ' || rest[pos] === '\t' || rest[pos] === '\r' || rest[pos] === '\n')) {
      pos += 1;
    }
    if (pos >= rest.length) {
      return null;
    }
    if (rest[pos] === ']') {
      pos += 1;
      while (pos < rest.length && (rest[pos] === ' ' || rest[pos] === '\t' || rest[pos] === '\r' || rest[pos] === '\n')) {
        pos += 1;
      }
      return rest[pos] === '>' ? rest.slice(pos + 1) : null;
    }
    if (rest.startsWith('<!--', pos)) {
      const end = rest.indexOf('-->', pos + 4);
      if (end === -1) {
        return null;
      }
      pos = end + 3;
    } else if (rest.startsWith('<?', pos)) {
      const end = rest.indexOf('?>', pos + 2);
      if (end === -1) {
        return null;
      }
      pos = end + 2;
    } else if (rest.startsWith('<!', pos)) {
      const decl = /^<!(?:ENTITY|ELEMENT|ATTLIST|NOTATION)(?=[\s])/i.exec(rest.slice(pos, pos + 12));
      if (!decl) {
        return null;
      }
      const end = scanXmlMarkupEnd(rest, pos + decl[0].length, false);
      if (end === -1) {
        return null;
      }
      pos = end + 1;
    } else if (rest[pos] === '%') {
      const peEnd = rest.indexOf(';', pos + 1);
      if (peEnd === -1 || !/^%[A-Za-z_:][\w.:-]*;$/.test(rest.slice(pos, peEnd + 1))) {
        return null;
      }
      pos = peEnd + 1;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Skip what can come before the root element of an XML document: a byte order mark, whitespace,
 * the XML declaration and other processing instructions, comments and an SVG doctype.
 * @param {string} text - The document text.
 * @return {string|null} The text from the root element on, or null when the prolog is not
 * terminated or declares a non-SVG doctype.
 */
function skipXmlProlog(text) {
  let rest = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith('<?')) {
      const end = rest.indexOf('?>', 2);
      if (end === -1) {
        return null;
      }
      rest = rest.slice(end + 2);
    } else if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->', 4);
      if (end === -1) {
        return null;
      }
      rest = rest.slice(end + 3);
    } else if (/^<!doctype/i.test(rest)) {
      rest = skipSvgDoctype(rest);
      if (rest === null) {
        return null;
      }
    } else {
      return rest;
    }
  }
}

/**
 * Check whether the given bytes contain C0 control characters disallowed in XML 1.0.
 * @param {Buffer} sample - The bytes to check.
 * @return {boolean} True when illegal XML control characters are present.
 */
function hasDisallowedXmlControlChars(sample) {
  return sample.some((byte) => byte < 0x20 && byte !== 0x09 && byte !== 0x0A && byte !== 0x0D);
}

/**
 * Check whether the given bytes are an SVG document: once the XML prolog is skipped, the root
 * element is `<svg` (optionally namespace-prefixed).
 * @param {Buffer} bytes - The bytes to check.
 * @return {boolean} True when the bytes are an SVG document.
 */
function isSvg(bytes) {
  const truncated = bytes.length > SVG_SCAN_LIMIT;
  const slice = bytes.subarray(0, Math.min(bytes.length, SVG_SCAN_LIMIT));
  if (hasDisallowedXmlControlChars(slice)) {
    return false;
  }
  const rest = skipXmlProlog(slice.toString('utf8'));
  if (rest === null) {
    return false;
  }
  const pattern = truncated
    ? /^<(?:[A-Za-z_][\w.-]*:)?svg(?:[\s/>]|$)/
    : /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/;
  return pattern.test(rest);
}

/**
 * Check whether the given bytes are a BMP image: the `BM` signature followed by a known DIB
 * header size, as `BM` alone is too common at the start of a text.
 * @param {Buffer} bytes - The bytes to check.
 * @return {boolean} True when the bytes are a BMP image.
 */
function isBmp(bytes) {
  return bytes.length >= 18
    && bytes[0] === 0x42 && bytes[1] === 0x4D
    && BMP_DIB_HEADER_SIZES.has(bytes.readUInt32LE(14));
}

/**
 * Detect the image format of the given bytes from their signature.
 * Recognises PNG (and APNG), JPEG, GIF, WebP, AVIF, HEIF/HEIC, BMP, TIFF, ICO, JPEG XL, JPEG 2000
 * and SVG.
 * @param {Buffer} bytes - The bytes to check.
 * @return {string|null} The image format (e.g. 'PNG', 'WebP'), or null when the bytes are not
 * a recognised image.
 */
export function detectImageFormat(bytes) {
  if (!bytes || bytes.length === 0) {
    return null;
  }
  for (const { format, offset, bytes: signature } of IMAGE_SIGNATURES) {
    if (hasBytesAt(bytes, signature, offset)) {
      return format;
    }
  }
  if (hasBytesAt(bytes, RIFF, 0) && hasBytesAt(bytes, WEBP, 8)) {
    return 'WebP';
  }
  const brands = getFtypBrands(bytes);
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) {
    return 'AVIF';
  }
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) {
    return 'HEIF';
  }
  if (isBmp(bytes)) {
    return 'BMP';
  }
  if (isSvg(bytes)) {
    return 'SVG';
  }
  return null;
}

/**
 * Check whether the given bytes are a PDF document: `%PDF-` within the first 1024 bytes, which
 * is where PDF readers look for it.
 * @param {Buffer} bytes - The bytes to check.
 * @return {boolean} True when the bytes are a PDF document.
 */
export function isPdf(bytes) {
  return Boolean(bytes) && bytes.subarray(0, PDF_SCAN_LIMIT).includes(PDF_MARKER);
}

/**
 * Check whether the given bytes are an MP4 video: an ISO-BMFF `ftyp` box at the start
 * containing a known MP4/video brand and no AVIF or HEIF image brands.
 * @param {Buffer} bytes - The bytes to check.
 * @return {boolean} True when the bytes are an MP4 video.
 */
export function isMp4(bytes) {
  const brands = getFtypBrands(bytes);
  return brands.length > 0
    && !brands.some((brand) => AVIF_BRANDS.has(brand) || HEIF_BRANDS.has(brand))
    && brands.some((brand) => MP4_BRANDS.has(brand));
}

const FILE_KIND_MATCHERS = new Map([
  [FILE_KIND.IMAGE, (bytes) => {
    const format = detectImageFormat(bytes);
    return format !== null && format !== 'SVG';
  }],
  [FILE_KIND.SVG, (bytes) => detectImageFormat(bytes) === 'SVG'],
  [FILE_KIND.PDF, isPdf],
  [FILE_KIND.VIDEO, isMp4],
]);

/**
 * Check whether the given bytes are the given kind of file. An image matches any recognised
 * image format, as servers often negotiate the format (e.g. WebP served for a `.jpg` URL).
 * Empty bytes never match.
 * @param {Buffer} bytes - The bytes to check.
 * @param {string} kind - One of the FILE_KIND values.
 * @return {boolean} True when the bytes are that kind of file.
 * @throws {Error} When kind is not one of the FILE_KIND values.
 */
export function matchesFileKind(bytes, kind) {
  const matcher = FILE_KIND_MATCHERS.get(kind);
  if (!matcher) {
    throw new Error(`Unknown file kind: ${kind}`);
  }
  return Boolean(bytes) && bytes.length > 0 && matcher(bytes);
}

/**
 * Check whether the given bytes look like text: no control characters other than whitespace.
 * @param {Buffer} sample - The bytes to check.
 * @return {boolean} True when the bytes look like text.
 */
function looksLikeText(sample) {
  return sample.every((byte) => byte >= 0x20 || (byte >= 0x09 && byte <= 0x0D));
}

/**
 * Describe in a few words what the given bytes look like, for log messages.
 * @param {Buffer} bytes - The bytes to describe.
 * @return {string} A short description, e.g. 'an HTML page', 'JSON', 'plain text of 38 bytes'.
 */
export function describeBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return 'empty';
  }
  const imageFormat = detectImageFormat(bytes);
  if (imageFormat) {
    return `an image (${imageFormat})`;
  }
  if (isPdf(bytes)) {
    return 'a PDF document';
  }
  if (isMp4(bytes)) {
    return 'an MP4 video';
  }

  const sample = bytes.subarray(0, DESCRIBE_SAMPLE_SIZE);
  if (!looksLikeText(sample)) {
    return `unknown binary data of ${bytes.length} bytes`;
  }
  const text = sample.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (HTML_PATTERN.test(text)) {
    return 'an HTML page';
  }
  if (text.startsWith('<?xml')) {
    return 'an XML document';
  }
  if (text.startsWith('<')) {
    return 'an HTML or XML document';
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    return 'JSON';
  }
  return `plain text of ${bytes.length} bytes`;
}
