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
import chalk from 'chalk';

/**
 * Print a human-readable summary of a composite upload result.
 *
 * Expected input shape:
 * {
 *   ok: boolean,
 *   filesystemRuns: any[],
 *   fallbackRuns: any[],
 *   errors: Array<{ type: string, path: string, message: string }>
 * }
 */
export function printUploadSummary(result, { maxErrorsToPrint = 20, logger = console } = {}) {
  const filesystemRuns = Array.isArray(result?.filesystemRuns) ? result.filesystemRuns : [];
  const fallbackRuns = Array.isArray(result?.fallbackRuns) ? result.fallbackRuns : [];
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  // Best-effort metric extraction (don't assume a specific schema)
  const extracted = extractBasicCounts(filesystemRuns, fallbackRuns);

  logger.info(chalk.green('='.repeat(50)));
  logger.info(chalk.green('Upload Summary:'));
  logger.info(chalk.green('='.repeat(50)));
  logger.info(chalk.cyan(`Status: ${result?.ok ? chalk.green('Success') : chalk.red('Failed')}`));
  logger.info(chalk.cyan(`Filesystem runs: ${filesystemRuns.length}`));
  logger.info(chalk.cyan(`Fallback batches: ${fallbackRuns.length}`));
  if (extracted.filesUploaded != null) {
    logger.info(chalk.cyan(`Uploaded files: ${chalk.green(extracted.filesUploaded)}`));
  }
  if (extracted.filesFailed != null && extracted.filesFailed > 0) {
    logger.info(chalk.cyan(`Failed files: ${chalk.red(extracted.filesFailed)}`));
  }
  if (errors.length > 0) {
    logger.info(chalk.cyan(`Errors collected: ${chalk.red(errors.length)}`));
  }

  if (errors.length) {
    logger.info('');
    logger.info(chalk.yellow(`--- First ${Math.min(errors.length, maxErrorsToPrint)} error(s) ---`));
    errors.slice(0, maxErrorsToPrint).forEach((e, idx) => {
      logger.info(
        chalk.red(`${idx + 1}. [${e.type || 'error'}] ${e.path || '<unknown path>'}: ${e.message || '<no message>'}`),
      );
    });

    if (errors.length > maxErrorsToPrint) {
      logger.info(chalk.yellow(`...and ${errors.length - maxErrorsToPrint} more error(s)`));
    }
  }
  
  logger.info(chalk.green('='.repeat(50)));
  logger.info('');
}

/**
 * Try to infer a couple of common counts from returned results.
 * This won't be perfect, but it's helpful when available.
 */
function extractBasicCounts(filesystemRuns, fallbackRuns) {
  let filesUploaded = 0;
  let filesFailed = 0;
  let hasAny = false;

  const scan = (obj) => {
    if (!obj || typeof obj !== 'object') return;

    // Common patterns to attempt:
    // - obj.filesUploaded / obj.filesFailed
    // - obj.metrics.filesUploaded / obj.metrics.filesFailed
    // - obj.uploaded / obj.failed
    const candidates = [
      ['filesUploaded', 'filesFailed'],
      ['uploaded', 'failed'],
    ];

    for (const [upKey, failKey] of candidates) {
      if (Number.isFinite(obj[upKey]) || Number.isFinite(obj[failKey])) {
        if (Number.isFinite(obj[upKey])) filesUploaded += obj[upKey];
        if (Number.isFinite(obj[failKey])) filesFailed += obj[failKey];
        hasAny = true;
      }
    }

    if (obj.metrics && typeof obj.metrics === 'object') {
      scan(obj.metrics);
    }
  };

  filesystemRuns.forEach(scan);
  fallbackRuns.forEach(scan);

  return {
    filesUploaded: hasAny ? filesUploaded : null,
    filesFailed: hasAny ? filesFailed : null,
  };
}
