/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';
import archiver from 'archiver';
import chalk from 'chalk';
import { DO_NOT_CONVERT_EXTENSIONS } from '../utils/download-assets.js';

/**
 * Ensure a directory exists by creating it recursively if missing.
 *
 * @param {string} dirPath - Directory path to ensure exists.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Extract a zip archive into the given destination directory.
 *
 * @param {string} zipPath - Path to the zip file to extract.
 * @param {string} destDir - Destination directory where files will be extracted.
 * @return {Promise<void>} Resolves when extraction completes.
 */
async function unzip(zipPath, destDir) {
  ensureDir(destDir);
  await fs.createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: destDir }))
    .promise();
}

/**
 * Create a zip archive from a directory (recursively).
 *
 * @param {string} sourceDir - Directory to archive.
 * @param {string} outPath - Path to the output .zip file.
 * @return {Promise<void>} Resolves when archiving completes.
 */
function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Escape special characters in a string for safe use inside RegExp.
 *
 * @param {string} string - Raw string to escape.
 * @return {string} Escaped string.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a map of original JCR asset paths to their PNG variants when conversion applies.
 * Conversion applies only when imagesToPng is true and the extension is not in the
 * DO_NOT_CONVERT_EXTENSIONS set.
 *
 * @param {Map<string,string>} assetMapping - Map of source URL -> JCR path. Values are used.
 * @param {boolean} imagesToPng - Whether PNG conversion is enabled.
 * @return {Map<string,string>} Map of original JCR path -> JCR path with .png extension.
 */
function buildReplacementMap(assetMapping, imagesToPng) {
  const replacements = new Map();
  if (!imagesToPng) {
    return replacements;
  }
  for (const jcrPath of assetMapping.values()) {
    const ext = path.extname(jcrPath).toLowerCase();
    if (!ext) {
      continue;
    }
    if (!DO_NOT_CONVERT_EXTENSIONS.has(ext)) {
      const newPath = path.join(path.dirname(jcrPath), `${path.basename(jcrPath, ext)}.png`).replace(/\\/g, '/');
      replacements.set(jcrPath, newPath);
    }
  }
  return replacements;
}

/**
 * Update a single XML file in-place, replacing occurrences of any keys in the
 * replacements map with their corresponding values.
 *
 * @param {string} filePath - Absolute path to the XML file.
 * @param {Map<string,string>} replacements - Map of original -> replacement strings.
 */
function updateXmlFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;
  for (const [from, to] of replacements.entries()) {
    const regex = new RegExp(escapeRegExp(from), 'g');
    if (regex.test(content)) {
      // get the file name from the `from` string
      const fileName = from.substring(from.lastIndexOf('/') + 1);
      const toFile = to.substring(to.lastIndexOf('/') + 1);
      console.debug(`Replacing ${fileName} with ${toFile} in ${filePath.substring(filePath.indexOf('jcr_root'))}`);
      content = content.replace(regex, to);
      updated = true;
    }
  }
  if (updated) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Recursively walk a directory and update all .xml files using the replacements map.
 *
 * @param {string} rootDir - Root directory to traverse.
 * @param {Map<string,string>} replacements - Map of original -> replacement strings.
 */
function walkAndUpdateXml(rootDir, replacements) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkAndUpdateXml(fullPath, replacements);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
      updateXmlFile(fullPath, replacements);
    }
  }
}

/**
 * Prepare a modified copy of the AEM content package.
 * - Copies the original zip into a temp folder
 * - Unzips it, updates XML asset references when images are converted to PNG
 * - Re-zips into a modified zip that can be installed
 *
 * @param {string} zipPath - Path to the original content package zip.
 * @param {Map<string,string>} assetMapping - Map of source URL -> JCR path, used to infer replacements.
 * @param {boolean} imagesToPng - Whether PNG conversion is enabled; determines if replacements are generated.
 * @returns {Promise<{originalZipPath: string, modifiedZipPath: string}>} Paths to the copied original and the modified zip.
 */
export async function prepareModifiedPackage(zipPath, assetMapping, imagesToPng) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-pkg-'));
  const originalZipPath = path.join(tempDir, 'original.zip');
  const unzipDir = path.join(tempDir, 'unzipped');
  const modifiedZipPath = path.join(tempDir, 'modified.zip');

  fs.copyFileSync(zipPath, originalZipPath);

  const replacements = buildReplacementMap(assetMapping, imagesToPng);
  if (replacements.size === 0) {
    // nothing to change, return copy of original
    console.info(chalk.yellow('No XML updates required for asset references.'));
    return { originalZipPath, modifiedZipPath: originalZipPath };
  }

  await unzip(originalZipPath, unzipDir);
  walkAndUpdateXml(unzipDir, replacements);
  await zipDirectory(unzipDir, modifiedZipPath);
  console.info(chalk.yellow('Prepared modified content package with updated asset references.'));
  return { originalZipPath, modifiedZipPath };
}


