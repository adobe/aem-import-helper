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
