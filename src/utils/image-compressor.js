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

/**
 * @fileoverview Image Compression Utility for AEM.live
 * 
 * COMPRESSION STRATEGY:
 * ====================
 * 
 * This module provides simple, high-quality image compression for AEM.live's 20MB file size limit.
 * 
 * APPROACH:
 * 
 * 1. SIZE CHECK
 *    - Files under 20MB: Skip compression (no changes needed)
 *    - Files over 20MB: Compress with Quality 100
 * 
 * 2. QUALITY 100 COMPRESSION
 *    - Uses maximum quality (100) for all formats
 *    - Preserves original format (no PNG→JPEG conversion)
 *    - Applies format-specific optimizations:
 *      * JPEG: Progressive encoding for better web loading
 *      * PNG: Compression level 8, interlaced for progressive loading
 *      * WebP: Effort level 4 for balanced encoding
 *    - Resizes if dimensions exceed 4000px
 * 
 * WHY QUALITY 100?
 * ===============
 * 
 * Testing with real-world images showed that:
 * - Modern compression is highly efficient even at Q100
 * - Q100 consistently produces files well under 20MB limit
 * - Complex quality calculations had minimal impact on final size
 * - Prioritizing visual quality over file size targeting provides better UX
 * 
 * PROGRESSIVE ENCODING:
 * ====================
 * 
 * Progressive images load in multiple passes (blurry→sharp) instead of top-to-bottom.
 * This improves perceived performance and Core Web Vitals (LCP) by showing content
 * immediately while downloading.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import chalk from 'chalk';

// AEM.live file size limits for compressible image formats (in bytes)
const AEM_IMAGE_SIZE_LIMITS = {
  images: 20 * 1024 * 1024, // 20 MB for images (.png, .jpg, .webp, etc.)
};


/**
 * Check if an image file exceeds AEM.live size limits for compressible formats
 * @param {string} filePath - Path to the file
 * @param {string} fileExtension - File extension (with dot)
 * @return {boolean} True if image file exceeds limits that this compressor can handle
 */
export function exceedsAemSizeLimit(filePath, fileExtension) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const fileSize = fs.statSync(filePath).size;
  const ext = fileExtension.toLowerCase();

  // Only check limits for image formats that Sharp can compress
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif', '.heic', '.heif'].includes(ext)) {
    return fileSize > AEM_IMAGE_SIZE_LIMITS.images;
  }
  // For non-compressible formats, return false
  return false;
}

/**
 * Get compression settings for the specified format
 * 
 * SIMPLIFIED APPROACH:
 * ===================
 * 
 * Uses Quality 100 (maximum quality) for all images regardless of size.
 * 
 * RATIONALE:
 * - Modern image compression is highly efficient
 * - Even Q100 compresses images well below 20MB limit
 * - Complex quality calculations had minimal impact on final size
 * - Prioritizes visual quality and simplicity over targeting specific file sizes
 * - Testing showed Q100 always stays under AEM's 20MB limit
 * 
 * @param {number} fileSize - Current file size in bytes (unused but kept for API compatibility)
 * @param {string} format - Image format (jpeg, png, webp)
 * @return {Object} Compression settings with maximum quality
 */
function getCompressionSettings(fileSize, format) {
  // Define format-specific settings inline with Q100 for all formats
  const settings = {
    quality: 100, // Maximum quality for all formats
  };
  
  // Add format-specific optimization settings
  if (format === 'jpeg' || format === 'jpg') {
    // Progressive JPEG: Image loads in multiple passes (blurry→sharp) instead of top-to-bottom.
    // Provides better perceived loading speed and often results in smaller file sizes.
    settings.progressive = true;

    // MozJPEG encoder: Disabled to target 18MB more accurately
    // While MozJPEG produces 5-10% smaller files, it compresses too aggressively
    // for our 18MB target, often resulting in 10-12MB when we want 16-18MB.
    settings.mozjpeg = false;
  } else if (format === 'png') {
    // Compression level (0-9): How much CPU effort to spend optimizing file size.
    // 8 provides excellent compression with reasonable processing time. 9 is slower with minimal gains.
    settings.compressionLevel = 8; // Good balance of speed and compression

    // Interlaced PNG: Image loads in multiple passes (blurry→sharp) instead of top-to-bottom.
    // Provides better perceived loading speed and often results in smaller file sizes.
    settings.progressive = true;   // Interlaced PNG for progressive loading
  } else if (format === 'webp') {
    // Balanced encoding effort: 4 is a good balance between speed and compression.
    // 0 is the fastest but produces the largest files, 6 is the slowest but produces the smallest files.
    // 4 is a good compromise between speed and compression.
    settings.effort = 4; // Balanced encoding effort
  }
  
  return settings;
}

/**
 * Determine the target format for compression
 * @param {Object} metadata - Sharp metadata object
 * @param {Object} options - Compression options
 * @return {string} Target format
 */
function determineTargetFormat(metadata, options) {
  if (options.format) {
    return options.format;
  }
  
  // Always preserve the original format - no conversion during compression
  // This ensures predictable behavior and preserves format fidelity
  return metadata.format;
}

/**
 * Apply format-specific compression settings to Sharp instance
 * @param {Object} sharpInstance - Sharp instance
 * @param {string} targetFormat - Target format
 * @param {Object} compressionSettings - Compression settings
 * @param {Object} metadata - Image metadata
 * @return {Object} Configured Sharp instance
 */
function applyFormatCompression(sharpInstance, targetFormat, compressionSettings, metadata) {
  switch (targetFormat) {
    case 'jpeg':
    case 'jpg':
      return sharpInstance.jpeg(compressionSettings);
    case 'png':
      return sharpInstance.png(compressionSettings);
    case 'webp':
      return sharpInstance.webp(compressionSettings);
    default:
      // For other formats, use the original format with optimization
      if (metadata.format === 'jpeg') {
        return sharpInstance.jpeg(compressionSettings);
      } else if (metadata.format === 'png') {
        return sharpInstance.png(compressionSettings);
      }
      return sharpInstance;
  }
}

/**
 * Apply resizing if image is too large
 * @param {Object} sharpInstance - Sharp instance
 * @param {Object} metadata - Image metadata
 * @param {number} maxDimension - Maximum dimension (default: 4000)
 * @return {Object} Sharp instance with resizing applied if needed
 */
function applyResizing(sharpInstance, metadata, maxDimension = 4000) {
  if (metadata.width > maxDimension || metadata.height > maxDimension) {
    return sharpInstance.resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  return sharpInstance;
}


/**
 * Compress an image file using Sharp
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path for compressed output (optional, defaults to inputPath)
 * @param {Object} options - Compression options
 * @param {string} options.format - Target format (jpeg, png, webp)
 * @param {boolean} options.preserveFormat - Keep original format if true
 * @return {Promise<{success: boolean, originalSize: number, compressedSize: number, compressionRatio: number}>}
 */
export async function compressImage(inputPath, outputPath = null, options = {}) {
  const targetPath = outputPath || inputPath;
  
  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${inputPath}`,
    };
  }
  
  const originalStats = fs.statSync(inputPath);
  const originalSize = originalStats.size;
  const fileExtension = path.extname(inputPath).toLowerCase();
  
  // Check if compression is needed
  if (!exceedsAemSizeLimit(inputPath, fileExtension)) {
    return {
      success: true,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0,
      skipped: true,
      reason: 'File within AEM size limits',
    };
  }

  try {
    let sharpInstance = sharp(inputPath);
    const metadata = await sharpInstance.metadata();
    
    // Determine target format
    const targetFormat = determineTargetFormat(metadata, options);
    
    // Get compression settings automatically calculated for AEM limits
    const compressionSettings = getCompressionSettings(originalSize, targetFormat);
    
    // Apply format-specific compression
    sharpInstance = applyFormatCompression(sharpInstance, targetFormat, compressionSettings, metadata);
    
    // Apply resizing if needed
    sharpInstance = applyResizing(sharpInstance, metadata);

    // Write compressed image
    await sharpInstance.toFile(targetPath);
    
    const compressedSize = fs.statSync(targetPath).size;
    const compressionRatio = originalSize / compressedSize;

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio,
      format: targetFormat,
      quality: compressionSettings.quality,
      skipped: false,
      meetsAemLimits: compressedSize <= AEM_IMAGE_SIZE_LIMITS.images,
    };
  } catch (error) {
    console.error(chalk.red(`Failed to compress image ${inputPath}:`), error.message);
    return {
      success: false,
      originalSize,
      error: error.message,
    };
  }
}

/**
 * Compress multiple images in a directory
 * @param {string} dirPath - Directory containing images
 * @param {Object} options - Compression options
 * @param {Array<string>} options.extensions - File extensions to process
 * @param {boolean} options.recursive - Process subdirectories
 * @return {Promise<Array>} Results for each processed file
 */
export async function compressImagesInDirectory(dirPath, options = {}) {
  const {
    extensions = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'],
    recursive = true,
    ...compressionOptions
  } = options;

  const results = [];

  async function processDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const itemPath = path.join(currentDir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory() && recursive) {
        await processDirectory(itemPath);
      } else if (stats.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (extensions.includes(ext)) {
          console.log(chalk.cyan(`Compressing: ${itemPath}`));
          const result = await compressImage(itemPath, null, compressionOptions);
          results.push({ path: itemPath, ...result });
          
          if (result.success && !result.skipped) {
            const savings = ((result.originalSize - result.compressedSize) / result.originalSize * 100).toFixed(1);
            console.log(chalk.green(`  ✓ Saved ${savings}% (${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)})`));
          } else if (result.skipped) {
            console.log(chalk.yellow(`  ⊘ Skipped: ${result.reason}`));
          } else {
            console.log(chalk.red(`  ✗ Failed: ${result.error}`));
          }
        }
      }
    }
  }

  await processDirectory(dirPath);
  return results;
}

/**
 * Format bytes as human readable string
 * @param {number} bytes - Number of bytes
 * @return {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get compression statistics for a directory
 * @param {Array} results - Results from compressImagesInDirectory
 * @return {Object} Statistics summary
 */
export function getCompressionStats(results) {
  const processed = results.filter(r => r.success && !r.skipped);
  const failed = results.filter(r => !r.success);
  const skipped = results.filter(r => r.skipped);
  
  const totalOriginalSize = processed.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressedSize = processed.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalSavings = totalOriginalSize - totalCompressedSize;
  const averageSavings = totalOriginalSize > 0 ? (totalSavings / totalOriginalSize * 100) : 0;

  return {
    totalFiles: results.length,
    processed: processed.length,
    failed: failed.length,
    skipped: skipped.length,
    totalOriginalSize,
    totalCompressedSize,
    totalSavings,
    averageSavings: averageSavings.toFixed(1),
    formattedStats: {
      totalOriginalSize: formatBytes(totalOriginalSize),
      totalCompressedSize: formatBytes(totalCompressedSize),
      totalSavings: formatBytes(totalSavings),
    },
  };
}
