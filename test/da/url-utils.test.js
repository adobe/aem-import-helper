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

import { describe, it } from 'mocha';
import { expect } from 'chai';

import {
  sanitizeFilename,
  sanitizePath,
  generateDocumentPath,
  getFilename,
  extractPageParentPath,
  buildDaAdminUrl,
  buildDaContentUrl,
  buildDaListUrl,
  buildEdgeDeliveryUrl,
  getFullyQualifiedAssetUrls,
} from '../../src/da/url-utils.js';

describe('url-utils.js', () => {
  describe('sanitizeFilename', () => {
    it('should strip diacritics and collapse hyphens', () => {
      expect(sanitizeFilename('café menü')).to.equal('cafe-menu');
    });

    it('should handle empty strings', () => {
      expect(sanitizeFilename('')).to.equal('');
    });

    it('should handle special characters', () => {
      expect(sanitizeFilename('file@name#1.txt')).to.equal('file-name-1-txt');
    });
  });

  describe('sanitizePath', () => {
    it('should preserve extension and sanitize path segments', () => {
      expect(sanitizePath('/folder/sub folder/file name.txt')).to.equal('/folder/sub-folder/file-name.txt');
    });

    it('should handle empty path', () => {
      expect(sanitizePath('')).to.equal('');
    });
  });

  describe('generateDocumentPath', () => {
    it('should decode, lowercase, strip .html/.htm and sanitize', () => {
      expect(generateDocumentPath('http://localhost/ABC%20def/page.htm')).to.equal('/abc-def/page');
    });

    it('should convert /index to / and trim trailing slash', () => {
      expect(generateDocumentPath('http://localhost/section/index')).to.equal('/section');
    });

    it('should replace non [a-z0-9/] with hyphens', () => {
      expect(generateDocumentPath('http://localhost/a@b/c&d.html')).to.equal('/a-b/c-d');
    });

    it('should support relative URLs', () => {
      expect(generateDocumentPath('/folder/page.HTML')).to.equal('/folder/page');
    });
  });

  describe('getFilename', () => {
    it('should extract filename from URL', () => {
      expect(getFilename('https://example.com/path/file.jpg')).to.equal('file.jpg');
    });

    it('should handle URLs without filename', () => {
      expect(getFilename('https://example.com/path/')).to.equal('path');
    });
  });

  describe('extractPageParentPath', () => {
    it('should extract parent path from shadow path', () => {
      expect(extractPageParentPath('documents/reports/.board-paper')).to.equal('documents/reports');
    });

    it('should handle shadow path without parent', () => {
      expect(extractPageParentPath('.page-name')).to.equal('');
    });

    it('should handle empty path', () => {
      expect(extractPageParentPath('')).to.equal('');
    });
  });

  describe('buildDaAdminUrl', () => {
    it('should build correct admin URL', () => {
      expect(buildDaAdminUrl('org', 'site')).to.equal('https://admin.da.live/source/org/site');
    });
  });

  describe('buildDaContentUrl', () => {
    it('should build correct content URL', () => {
      expect(buildDaContentUrl('org', 'site')).to.equal('https://content.da.live/org/site');
    });
  });

  describe('buildDaListUrl', () => {
    it('should build correct list URL', () => {
      expect(buildDaListUrl('org', 'site')).to.equal('https://admin.da.live/list/org/site');
    });
  });

  describe('buildEdgeDeliveryUrl', () => {
    it('should build correct Edge Delivery URL', () => {
      expect(buildEdgeDeliveryUrl('org', 'site', 'path/to/file.pdf')).to.equal('https://main--site--org.aem.page/path/to/file.pdf');
    });

    it('should handle path starting with slash', () => {
      expect(buildEdgeDeliveryUrl('org', 'site', '/path/to/file.pdf')).to.equal('https://main--site--org.aem.page/path/to/file.pdf');
    });
  });

  describe('getFullyQualifiedAssetUrls', () => {
    it('should qualify relative URLs', () => {
      const assetUrls = ['/image.jpg', 'https://example.com/external.jpg'];
      const result = getFullyQualifiedAssetUrls(assetUrls, 'https://example.com');
      expect(result).to.deep.equal(['https://example.com/image.jpg', 'https://example.com/external.jpg']);
    });

    it('should handle missing siteOrigin', () => {
      const assetUrls = ['/image.jpg'];
      const result = getFullyQualifiedAssetUrls(assetUrls, null);
      expect(result).to.equal(assetUrls);
    });
  });
});
