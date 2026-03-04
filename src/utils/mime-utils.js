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

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

/**
 * Magic byte signatures for common file formats.
 * Each entry has a byte pattern (as a Buffer) and an offset at which to match.
 */
const MAGIC_SIGNATURES = [
  // Images
  { bytes: Buffer.from([0xFF, 0xD8, 0xFF]), offset: 0, mime: 'image/jpeg', ext: '.jpg' },
  { bytes: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), offset: 0, mime: 'image/png', ext: '.png' },
  { bytes: Buffer.from('GIF87a'), offset: 0, mime: 'image/gif', ext: '.gif' },
  { bytes: Buffer.from('GIF89a'), offset: 0, mime: 'image/gif', ext: '.gif' },
  { bytes: Buffer.from([0x42, 0x4D]), offset: 0, mime: 'image/bmp', ext: '.bmp' },
  { bytes: Buffer.from([0x00, 0x00, 0x01, 0x00]), offset: 0, mime: 'image/x-icon', ext: '.ico' },
  { bytes: Buffer.from([0x00, 0x00, 0x02, 0x00]), offset: 0, mime: 'image/x-icon', ext: '.ico' },
  // TIFF (little-endian)
  { bytes: Buffer.from([0x49, 0x49, 0x2A, 0x00]), offset: 0, mime: 'image/tiff', ext: '.tiff' },
  // TIFF (big-endian)
  { bytes: Buffer.from([0x4D, 0x4D, 0x00, 0x2A]), offset: 0, mime: 'image/tiff', ext: '.tiff' },
  // Documents
  { bytes: Buffer.from('%PDF'), offset: 0, mime: 'application/pdf', ext: '.pdf' },
];

/**
 * RIFF-based formats require checking a secondary identifier at offset 8.
 */
const RIFF_SUBTYPES = [
  { bytes: Buffer.from('WEBP'), mime: 'image/webp', ext: '.webp' },
];

/**
 * ISOBMFF (ISO Base Media File Format) ftyp-based formats.
 * The ftyp box starts at offset 4 with "ftyp", then the brand starts at offset 8.
 */
const FTYP_BRANDS = [
  { brand: 'avif', mime: 'image/avif', ext: '.avif' },
  { brand: 'avis', mime: 'image/avif', ext: '.avif' },
  { brand: 'heic', mime: 'image/heic', ext: '.heic' },
  { brand: 'heix', mime: 'image/heic', ext: '.heic' },
  { brand: 'hevc', mime: 'image/heic', ext: '.heic' },
  { brand: 'hevx', mime: 'image/heic', ext: '.heic' },
  { brand: 'mif1', mime: 'image/heif', ext: '.heif' },
  { brand: 'msf1', mime: 'image/heif', ext: '.heif' },
];

/**
 * ZIP-based format detection by inspecting the first file entry in the archive.
 * Office Open XML formats (DOCX, XLSX, PPTX) are ZIP files with specific content types.
 */
const ZIP_CONTENT_TYPES = [
  { pattern: 'word/', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  { pattern: 'xl/', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  { pattern: 'ppt/', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
];

// OLE Compound Document magic bytes (legacy Office formats: .doc, .xls, .ppt)
const OLE_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);

// ZIP magic bytes
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

// RIFF magic bytes
const RIFF_MAGIC = Buffer.from('RIFF');

// ftyp identifier
const FTYP_MAGIC = Buffer.from('ftyp');

// How many bytes to read for MIME detection
const HEADER_SIZE = 4110;

/**
 * Detect the MIME type of a file by reading its magic bytes.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<{mime: string, ext: string}|null>} The detected MIME type and
 *   recommended extension, or null if detection failed.
 */
export async function detectMimeType(filePath) {
  let fd;
  try {
    fd = await fsp.open(filePath, 'r');
    const buf = Buffer.alloc(HEADER_SIZE);
    const { bytesRead } = await fd.read(buf, 0, HEADER_SIZE, 0);

    if (bytesRead === 0) return null;

    const header = buf.subarray(0, bytesRead);

    // Check simple magic signatures first
    for (const sig of MAGIC_SIGNATURES) {
      if (header.length >= sig.offset + sig.bytes.length
        && header.subarray(sig.offset, sig.offset + sig.bytes.length).equals(sig.bytes)) {
        return { mime: sig.mime, ext: sig.ext };
      }
    }

    // Check RIFF-based formats (WebP)
    if (header.length >= 12 && header.subarray(0, 4).equals(RIFF_MAGIC)) {
      const subtype = header.subarray(8, 12);
      for (const rt of RIFF_SUBTYPES) {
        if (subtype.equals(rt.bytes)) {
          return { mime: rt.mime, ext: rt.ext };
        }
      }
    }

    // Check ftyp-based formats (HEIC, HEIF, AVIF)
    if (header.length >= 12 && header.subarray(4, 8).equals(FTYP_MAGIC)) {
      const brand = header.subarray(8, 12).toString('ascii').toLowerCase();
      for (const fb of FTYP_BRANDS) {
        if (brand === fb.brand) {
          return { mime: fb.mime, ext: fb.ext };
        }
      }
    }

    // Check ZIP-based formats (DOCX, XLSX, PPTX)
    if (header.length >= 4 && header.subarray(0, 4).equals(ZIP_MAGIC)) {
      // Read enough of the ZIP to find content hints
      const content = header.toString('ascii', 0, Math.min(bytesRead, HEADER_SIZE));
      for (const zt of ZIP_CONTENT_TYPES) {
        if (content.includes(zt.pattern)) {
          return { mime: zt.mime, ext: zt.ext };
        }
      }
    }

    // Check OLE Compound Document (legacy .doc/.xls/.ppt)
    if (header.length >= OLE_MAGIC.length && header.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) {
      // Default to .doc for OLE — exact differentiation requires deep parsing
      return { mime: 'application/msword', ext: '.doc' };
    }

    // Check for SVG (text-based XML with <svg element)
    const textHeader = header.toString('utf8', 0, Math.min(bytesRead, 1024)).trim();
    if (textHeader.startsWith('<?xml') || textHeader.startsWith('<svg')) {
      if (textHeader.includes('<svg')) {
        return { mime: 'image/svg+xml', ext: '.svg' };
      }
    }

    return null;
  } finally {
    if (fd) {
      await fd.close();
    }
  }
}

/**
 * Walk a directory recursively and find all files without extensions.
 * For each extensionless file, detect its MIME type from content and rename it
 * with the appropriate extension.
 *
 * @param {string} dir - The directory to process
 * @param {Map<string,string>} [renamedMap] - Optional map to collect old path → new path mappings.
 *   If not provided, a new Map will be created internally.
 * @returns {Promise<Map<string,string>>} A Map of old absolute path → new absolute path for every
 *   file that was renamed.
 */
export async function addExtensionsToFiles(dir, renamedMap = new Map()) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await addExtensionsToFiles(fullPath, renamedMap);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!ext) {
        const detected = await detectMimeType(fullPath);
        if (detected) {
          const newPath = `${fullPath}${detected.ext}`;
          fs.renameSync(fullPath, newPath);
          renamedMap.set(fullPath, newPath);
          console.log(chalk.gray(`  Renamed: ${entry.name} → ${entry.name}${detected.ext} (${detected.mime})`));
        }
      }
    }
  }

  return renamedMap;
}
