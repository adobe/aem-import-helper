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

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import chalk from 'chalk';

// AEM.live file size limits for compressible image formats (in bytes)
const AEM_IMAGE_SIZE_LIMITS = {
  images: 20 * 1024 * 1024, // 20 MB for images (.png, .jpg, .webp, etc.)
};

// Default compression settings optimized for web delivery
const DEFAULT_COMPRESSION_SETTINGS = {
  jpeg: {
    quality: 85, // Sweet spot for web images (perceptually lossless)
    progressive: true, // Better loading UX, often smaller files
    mozjpeg: true, // 5-10% smaller files than standard encoder
  },
  png: {
    quality: 90, // Conservative for graphics/logos
    compressionLevel: 8, // Near-optimal (0-9 scale), good speed/size balance
    progressive: true, // Interlaced loading
  },
  webp: {
    quality: 85, // Consistent with JPEG, 25-30% smaller files
    effort: 4, // Balanced encoding (0-6 scale)
  },
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
 * Calculate required compression quality to meet AEM size limits
 * @param {number} fileSize - Current file size in bytes
 * @param {string} format - Image format (jpeg, png, webp)
 * @return {Object} Compression settings
 */
function getCompressionSettings(fileSize, format) {
  const settings = { ...DEFAULT_COMPRESSION_SETTINGS[format] };
  
  const targetSize = AEM_IMAGE_SIZE_LIMITS.images; // 20MB limit
  
  // If file is within limits, use default quality
  if (fileSize <= targetSize) {
    return settings;
  }
  
  // Calculate compression ratio needed: how much smaller the file needs to be
  const compressionRatioNeeded = fileSize / targetSize;
  
  // Estimate quality needed based on compression ratio
  // These are empirical approximations for typical images
  let targetQuality;
  if (compressionRatioNeeded <= 2) {
    // Need to reduce by 50% or less - high quality works
    targetQuality = 80;
  } else if (compressionRatioNeeded <= 4) {
    // Need to reduce by 75% - medium quality
    targetQuality = 70;
  } else if (compressionRatioNeeded <= 8) {
    // Need to reduce by 87.5% - lower quality
    targetQuality = 60;
  } else {
    // Need dramatic reduction - minimum acceptable quality
    targetQuality = 50;
  }
  
  settings.quality = targetQuality;
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
  
  if (options.preserveFormat) {
    return metadata.format;
  }
  
  // Default to JPEG for photos, PNG for graphics with transparency
  return metadata.hasAlpha ? 'png' : 'jpeg';
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
 * Perform iterative compression attempts to meet size limits
 * @param {string} inputPath - Input file path
 * @param {string} targetPath - Output file path
 * @param {string} targetFormat - Target format
 * @param {Object} compressionSettings - Initial compression settings
 * @param {Object} metadata - Image metadata
 * @param {number} targetSize - Target file size in bytes
 * @return {Promise<{size: number, attempts: number, finalQuality: string}>}
 */
async function performIterativeCompression(inputPath, targetPath, targetFormat, compressionSettings, metadata, targetSize) {
  let attempts = 1;
  let currentQuality = compressionSettings.quality;
  let compressedSize = fs.statSync(targetPath).size;
  
  const maxAttempts = 3;
  
  while (compressedSize > targetSize && attempts < maxAttempts) {
    attempts++;
    // Reduce quality more aggressively
    currentQuality = Math.max(30, currentQuality - 15);
    
    const retrySettings = { ...compressionSettings, quality: currentQuality };
    let retryInstance = sharp(inputPath);
    
    // Reapply format and settings
    retryInstance = applyFormatCompression(retryInstance, targetFormat, retrySettings, metadata);
    
    // Resize more aggressively for retry attempts
    retryInstance = applyResizing(retryInstance, metadata, 3000);
    
    await retryInstance.toFile(targetPath);
    compressedSize = fs.statSync(targetPath).size;
  }
  
  const finalQuality = attempts > 1 ? 
    `${compressionSettings.quality} → ${currentQuality}` : 
    compressionSettings.quality;
  
  return { size: compressedSize, attempts, finalQuality };
}

/**
 * Compress an image file using Sharp
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path for compressed output (optional, defaults to inputPath)
 * @param {Object} options - Compression options
 * @param {string} options.format - Target format (jpeg, png, webp)
 * @param {boolean} options.preserveFormat - Keep original format if true
 * @param {boolean} options.forceCompress - Compress even if under size limit
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
  if (!options.forceCompress && !exceedsAemSizeLimit(inputPath, fileExtension)) {
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

    // Write initial compressed image
    await sharpInstance.toFile(targetPath);
    
    // Check if we need iterative optimization
    const needsSizeOptimization = originalSize > AEM_IMAGE_SIZE_LIMITS.images;
    let compressedSize = fs.statSync(targetPath).size;
    let attempts = 1;
    let finalQuality = compressionSettings.quality;
    
    if (needsSizeOptimization && compressedSize > AEM_IMAGE_SIZE_LIMITS.images) {
      const result = await performIterativeCompression(
        inputPath, 
        targetPath, 
        targetFormat, 
        compressionSettings, 
        metadata, 
        AEM_IMAGE_SIZE_LIMITS.images,
      );
      compressedSize = result.size;
      attempts = result.attempts;
      finalQuality = result.finalQuality;
    }
    
    const compressionRatio = originalSize / compressedSize;

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio,
      format: targetFormat,
      attempts,
      finalQuality,
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
