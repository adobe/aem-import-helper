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

import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import path from 'path';
import { updateAssetReferencesInHTML } from '../../src/da/da-helper.js';

const mockDependencies = {
  JSDOM,
  path,
};

describe('Asset References with Image/Non-Image Separation', () => {
  it('should handle images and non-images differently', () => {
    const htmlContent = `
      <html>
        <body>
          <a href="https://example.com/document.pdf">Download PDF</a>
          <img src="https://example.com/image.jpg" alt="Image">
        </body>
      </html>
    `;
    
    const assetUrls = new Set([
      'https://example.com/document.pdf',
      'https://example.com/image.jpg'
    ]);
    
    const fullShadowPath = 'page-parent-folder/.board-paper-templates-and-submission-information';
    
    const result = updateAssetReferencesInHTML(
      fullShadowPath,
      htmlContent, 
      assetUrls, 
      'org',
      'site',
      mockDependencies
    );
    
    const dom = new JSDOM(result);
    const document = dom.window.document;
    
    // Check that PDF (non-image) uses edge delivery preview URL with media folder
    const pdfLink = document.querySelector('a[href]');
    expect(pdfLink.getAttribute('href')).to.equal('https://main--site--org.aem.page/page-parent-folder/media/document.pdf');
    
    // Check that image uses relative path to shadow folder
    const image = document.querySelector('img[src]');
    expect(image.getAttribute('src')).to.equal('./page-parent-folder/.board-paper-templates-and-submission-information/image.jpg');
  });
  
  it('should handle non-image assets with edge delivery URLs', () => {
    const htmlContent = '<a href="https://example.com/report.pdf">Report</a>';
    const assetUrls = new Set(['https://example.com/report.pdf']);
    const fullShadowPath = 'about/leadership/.about-uws-leadership-board-of-trustees';
    
    const result = updateAssetReferencesInHTML(
      fullShadowPath,
      htmlContent, 
      assetUrls, 
      'org',
      'site',
      mockDependencies
    );
    
    const dom = new JSDOM(result);
    const document = dom.window.document;
    
    const link = document.querySelector('a[href]');
    expect(link.getAttribute('href')).to.equal('https://main--site--org.aem.page/about/leadership/media/report.pdf');
  });
  
  it('should handle image assets with relative paths', () => {
    const htmlContent = '<img src="https://example.com/photo.png" alt="Photo">';
    const assetUrls = new Set(['https://example.com/photo.png']);
    const fullShadowPath = 'test-folder/.test-page';
    
    const result = updateAssetReferencesInHTML(
      fullShadowPath,
      htmlContent, 
      assetUrls, 
      'org',
      'site',
      mockDependencies
    );
    
    const dom = new JSDOM(result);
    const document = dom.window.document;
    
    const image = document.querySelector('img[src]');
    expect(image.getAttribute('src')).to.equal('./test-folder/.test-page/photo.png');
  });

  it('should handle edge case with empty page parent path', () => {
    const htmlContent = '<a href="https://example.com/document.pdf">Download PDF</a>';
    const assetUrls = new Set(['https://example.com/document.pdf']);
    const fullShadowPath = '.test-page'; // no parent path
    
    const result = updateAssetReferencesInHTML(
      fullShadowPath,
      htmlContent, 
      assetUrls, 
      'org',
      'site',
      mockDependencies
    );
    
    const dom = new JSDOM(result);
    const document = dom.window.document;
    
    const link = document.querySelector('a[href]');
    expect(link.getAttribute('href')).to.equal('https://main--site--org.aem.page/media/document.pdf');
  });

  it('should use Edge Delivery URLs for non-image assets by default', () => {
    const htmlContent = '<a href="https://example.com/document.pdf">Download PDF</a>';
    const assetUrls = new Set(['https://example.com/document.pdf']);
    const fullShadowPath = 'documents/reports/.test-page';
    
    const result = updateAssetReferencesInHTML(
      fullShadowPath,
      htmlContent, 
      assetUrls, 
      'org',
      'site',
      mockDependencies
    );
    
    const dom = new JSDOM(result);
    const document = dom.window.document;
    
    const link = document.querySelector('a[href]');
    expect(link.getAttribute('href')).to.equal('https://main--site--org.aem.page/documents/reports/media/document.pdf');
  });
}); 