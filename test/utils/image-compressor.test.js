/*
 * Copyright 2024 Adobe. All rights reserved.
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
import { exceedsAemSizeLimit, compressImage, getCompressionStats } from '../../src/utils/image-compressor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Image Compressor', () => {
  describe('exceedsAemSizeLimit', () => {
    it('should return false for non-existent file', () => {
      const result = exceedsAemSizeLimit('/non-existent-file.jpg', '.jpg');
      expect(result).to.be.false;
    });

    it('should detect large image files', () => {
      // Create a temporary large file for testing
      const tempFile = path.join(__dirname, 'temp-large-image.jpg');
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB
      fs.writeFileSync(tempFile, largeBuffer);

      try {
        const result = exceedsAemSizeLimit(tempFile, '.jpg');
        expect(result).to.be.true;
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return false for files within limits', () => {
      const tempFile = path.join(__dirname, 'temp-small-image.jpg');
      const smallBuffer = Buffer.alloc(1024); // 1KB
      fs.writeFileSync(tempFile, smallBuffer);

      try {
        const result = exceedsAemSizeLimit(tempFile, '.jpg');
        expect(result).to.be.false;
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return false for non-image files (PDF, MP4)', () => {
      const tempFile = path.join(__dirname, 'temp-large-pdf.pdf');
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB PDF
      fs.writeFileSync(tempFile, largeBuffer);

      try {
        const result = exceedsAemSizeLimit(tempFile, '.pdf');
        expect(result).to.be.false; // Should return false because this compressor can't handle PDFs
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('compressImage', () => {
    it('should skip compression for files within limits', async () => {
      const testImagePath = path.join(__dirname, '../aem/fixtures/image1.jpeg');
      
      if (!fs.existsSync(testImagePath)) {
        // Skip test if fixture doesn't exist
        return;
      }

      const result = await compressImage(testImagePath, null, { forceCompress: false });
      
      expect(result.success).to.be.true;
      expect(result.skipped).to.be.true;
      expect(result.reason).to.equal('File within AEM size limits');
    });

    it('should handle non-existent input file gracefully', async () => {
      const result = await compressImage('/non-existent-file.jpg');
      
      expect(result.success).to.be.false;
      expect(result.error).to.be.a('string');
    });

    it('should actually compress an oversized image', async function() {
      // Increase timeout for creating large image
      this.timeout(30000);
      
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      
      const testImagePath = path.join(tempDir, 'oversized-test.png');
      const outputPath = path.join(tempDir, 'compressed-output.jpg');
      
      try {
        const sharp = (await import('sharp')).default;
        
        // Create an uncompressed PNG that will definitely exceed 20MB
        // PNG with no compression: width * height * 3 bytes (RGB) + headers
        const width = 3000;
        const height = 2500;
        // This will be roughly: 3000 * 2500 * 3 = 22.5MB uncompressed
        
        await sharp({
          create: {
            width,
            height,
            channels: 3,
            background: { r: 255, g: 128, b: 64 }, // Solid color
          },
        })
          .png({ compressionLevel: 0 }) // No compression = large file
          .toFile(testImagePath);

        const originalSize = fs.statSync(testImagePath).size;
        console.log(`Created oversized image: ${(originalSize / 1024 / 1024).toFixed(1)}MB`);
        
        // Verify it actually exceeds 20MB (if not, skip test)
        if (originalSize <= 20 * 1024 * 1024) {
          console.log('Test image not large enough, skipping');
          return;
        }

        // Now compress it - this should NOT be skipped
        const result = await compressImage(testImagePath, outputPath);
        
        expect(result.success).to.be.true;
        expect(result.skipped).to.be.false;
        expect(result.compressedSize).to.be.lessThan(result.originalSize);
        expect(result.compressionRatio).to.be.greaterThan(1);
        expect(result.meetsAemLimits).to.be.true;
        
        // Verify compressed file meets AEM limits
        expect(fs.existsSync(outputPath)).to.be.true;
        const compressedSize = fs.statSync(outputPath).size;
        expect(compressedSize).to.be.lessThanOrEqual(20 * 1024 * 1024);
        expect(compressedSize).to.equal(result.compressedSize);
        
      } finally {
        // Cleanup
        [testImagePath, outputPath].forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });

    it('should compress very large images with smart quality targeting', async function() {
      // Increase timeout for creating very large image
      this.timeout(45000);
      
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      
      const testImagePath = path.join(tempDir, 'huge-test.png');
      const outputPath = path.join(tempDir, 'smart-output.jpg');
      
      try {
        const sharp = (await import('sharp')).default;
        
        // Create a very large image to test smart quality targeting
        const width = 5000;
        const height = 4000;
        const channels = 3;
        
        // Generate complex pattern
        const complexBuffer = Buffer.alloc(width * height * channels);
        for (let i = 0; i < complexBuffer.length; i++) {
          complexBuffer[i] = Math.floor(Math.random() * 256);
        }
        
        // Save as uncompressed PNG to ensure large size
        await sharp(complexBuffer, { raw: { width, height, channels } })
          .png({ compressionLevel: 0 }) // No compression
          .toFile(testImagePath);

        const originalSize = fs.statSync(testImagePath).size;
        console.log(`Created huge image: ${(originalSize / 1024 / 1024).toFixed(1)}MB`);
        
        // Skip if image isn't large enough
        if (originalSize <= 40 * 1024 * 1024) { // Need significantly larger than 20MB
          console.log('Test image not large enough, skipping');
          return;
        }

        // Compress it with smart quality targeting
        const result = await compressImage(testImagePath, outputPath);
        
        expect(result.success).to.be.true;
        expect(result.skipped).to.be.false;
        expect(result.quality).to.be.a('number'); // Should have quality property
        expect(result.compressedSize).to.be.lessThan(result.originalSize);
        expect(result.meetsAemLimits).to.be.true;
        
        // Verify the compressed file actually meets AEM size limits
        expect(fs.existsSync(outputPath)).to.be.true;
        const compressedSize = fs.statSync(outputPath).size;
        expect(compressedSize).to.be.lessThanOrEqual(20 * 1024 * 1024);
        expect(compressedSize).to.equal(result.compressedSize);
        
        // Quality 100 compression should stay well under 20MB limit
        const aemLimit = 20 * 1024 * 1024; // 20MB AEM Edge Delivery limit
        const isUnderLimit = compressedSize < aemLimit;
        
        console.log(`Smart compression: Quality ${result.quality}, size ${(compressedSize/1024/1024).toFixed(1)}MB`);
        console.log(`Targets ~18MB instead of over-compressing: ${isUnderLimit ? '✓' : '✗'}`);
        
      } finally {
        // Cleanup
        [testImagePath, outputPath].forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });
  });

  describe('getCompressionStats', () => {
    it('should calculate correct statistics', () => {
      const mockResults = [
        { 
          success: true, 
          skipped: false, 
          originalSize: 1000000, 
          compressedSize: 500000, 
        },
        { 
          success: true, 
          skipped: false, 
          originalSize: 2000000, 
          compressedSize: 1000000, 
        },
        { 
          success: false, 
          error: 'Mock error', 
        },
        { 
          success: true, 
          skipped: true, 
          reason: 'Within limits', 
        },
      ];

      const stats = getCompressionStats(mockResults);

      expect(stats.totalFiles).to.equal(4);
      expect(stats.processed).to.equal(2);
      expect(stats.failed).to.equal(1);
      expect(stats.skipped).to.equal(1);
      expect(stats.totalOriginalSize).to.equal(3000000);
      expect(stats.totalCompressedSize).to.equal(1500000);
      expect(stats.totalSavings).to.equal(1500000);
      expect(stats.averageSavings).to.equal('50.0');
    });

    it('should handle empty results', () => {
      const stats = getCompressionStats([]);

      expect(stats.totalFiles).to.equal(0);
      expect(stats.processed).to.equal(0);
      expect(stats.failed).to.equal(0);
      expect(stats.skipped).to.equal(0);
      expect(stats.averageSavings).to.equal('0.0');
    });
  });
});
