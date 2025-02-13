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
import { expect } from 'chai';
import sinon from 'sinon';
import * as downloadImagesModule from '../../src/aem/downloadImages.js';
import { downloadImagesInMarkdown } from '../../src/aem/downloadImages.js';
import { Readable } from 'stream';

describe('downloadImages.js', function () {
  this.timeout(30000); // Increase timeout to 30 seconds

  let readFileSyncStub, mkdirSyncStub, createWriteStreamStub, consoleErrorStub, consoleInfoStub;

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    mkdirSyncStub = sinon.stub(fs, 'mkdirSync');
    createWriteStreamStub = sinon.stub(fs, 'createWriteStream');
    global.fetchStub = sinon.stub(global, 'fetch'); // figure out how to stub node-fetch correctly
    consoleErrorStub = sinon.stub(console, 'error');
    consoleInfoStub = sinon.stub(console, 'info');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getImageUrlMap', () => {
    it('should return a map of image URLs to JCR node paths', () => {
      const mockData = JSON.stringify({ 'http://example.com/image1.jpg': '/content/dam/image1.jpg' });
      readFileSyncStub.returns(mockData);

      const result = downloadImagesModule.getImageUrlMap('path/to/image-mapping.json');
      expect(result).to.deep.equal(new Map([['http://example.com/image1.jpg', '/content/dam/image1.jpg']]));
    });

    it('should return undefined for invalid JSON', () => {
      readFileSyncStub.throws(new Error('Invalid JSON'));

      const result = downloadImagesModule.getImageUrlMap('path/to/image-mapping.json');
      expect(result).to.be.undefined;
    });
  });

  describe('ensureDirSync', () => {
    it('should create directory if it does not exist', () => {
      mkdirSyncStub.returns();

      downloadImagesModule.ensureDirSync('path/to/directory');
      expect(mkdirSyncStub).to.have.been.calledWith('path/to/directory', { recursive: true });
    });

    it('should log error if directory creation fails', () => {
      mkdirSyncStub.throws(new Error('Error creating directory'));

      downloadImagesModule.ensureDirSync('path/to/directory');
      expect(consoleErrorStub).to.have.been.calledWith(sinon.match.string);
    });
  });

  describe('downloadImage', () => {
    it('should download image and save to file system', async () => {
      const mockResponse = {
        ok: true,
        body: new Readable({
          read() {
            this.push('mock image data'); // Push data into the stream
            this.push(null); // Signal end of stream
          },
        }),
      };
      global.fetchStub.resolves(mockResponse);

      await downloadImagesModule.downloadImage({ maxRetries: 3 }, 'http://example.com/image.jpg', '/content/dam/image.jpg');
      expect(global.fetchStub).to.have.been.calledWith('http://example.com/image.jpg');
      expect(createWriteStreamStub).to.have.been.calledWith('/content/dam/image.jpg');
    });

    it('should retry download on failure', async () => {
      global.fetchStub.rejects(new Error('Failed to fetch http://example.com/image.jpg. Status: 404.'));

      await expect(downloadImagesModule.downloadImage({ maxRetries: 3 }, 'http://example.com/image.jpg', '/content/dam/image.jpg')).to.be.rejectedWith('Failed to fetch http://example.com/image.jpg. Status: 404.');
      expect(consoleInfoStub).to.have.been.calledWith(sinon.match.string);
    });
  });

  describe('downloadImagesInMarkdown', () => {
    it('should download images from markdown file', async () => {
      const mapFileContent = '{"http://example.com/image1.jpg":"/content/dam/image1.jpg"}';
      readFileSyncStub.returns(mapFileContent);

      const mockResponse = { ok: true, body: { pipe: sinon.stub() } };
      global.fetchStub.resolves(mockResponse);

      createWriteStreamStub.returns({ on: sinon.stub().callsArg(1) });

      // test downloadImagesInMarkdown method
      await downloadImagesInMarkdown({ maxRetries: 3, downloadLocation: 'path/to/download' }, 'path/to/markdown.md');
      expect(global.fetchStub).to.have.been.calledWith('http://example.com/image1.jpg');
      expect(createWriteStreamStub).to.have.been.called;
    });
  });
});
