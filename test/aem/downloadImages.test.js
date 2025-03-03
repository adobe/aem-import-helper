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
import { expect, use } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import * as downloadImagesModule from '../../src/aem/downloadImages.js';
import { downloadImagesInMarkdown } from '../../src/aem/downloadImages.js';
import { Readable, Writable } from 'stream';
import path from 'path';
import { expectLogContains } from '../utils.js';

use(sinonChai); // chai.use
use(chaiAsPromised);

describe('downloadImages.js', function () {
  this.timeout(30000); // Increase timeout to 30 seconds
  let fetchStub;
  let imageData;
  let readFileSyncStub;
  let mkdirSyncStub;
  let createWriteStreamStub;
  let consoleErrorStub;

  // Create a stub for fetch that returns a ReadableStream with image data
  function createFetchStub(data = 'image data', status = 200, ok = true) {
    return sinon.stub(globalThis, 'fetch').callsFake(async (url) => {
      if (!url) throw new Error('URL is undefined');

      const readableStream = new Readable({
        read() {
          this.push(data); // Simulated image data
          this.push(null);
        },
      });

      // fetch in Node.js returns a Web ReadableStream, not a Node.js Readable stream.
      // Wrap the Node.js Readable stream (readableStream) inside a Web ReadableStream (webReadableStream).
      // This ensures getReader() is available.
      const webReadableStream = new globalThis.ReadableStream({
        start(controller) {
          readableStream.on('data', (chunk) => controller.enqueue(chunk));
          readableStream.on('end', () => controller.close());
        },
      });

      return { ok, status, body: webReadableStream };
    });
  }

  let fetchHandler = () => {
    console.log('here');
    return {
      ok: true,
      status: 200,
      body: new Readable({
        read() {
          this.push('image data');
          this.push(null);
        },
      }),
    }
  }

  beforeEach(() => {
    consoleErrorStub = sinon.spy(console, 'error');
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    mkdirSyncStub = sinon.stub(fs, 'mkdirSync');
    imageData = ''; // Reset image data

    // Mock writable stream for file writing
    const mockStream = new Writable({
      write(chunk, encoding, callback) {
        imageData += chunk.toString(); // Collect written data
        callback(); // Signal that writing is done
      },
      end(callback) {
        callback(); // Ensure the stream properly ends
      },
    });

    createWriteStreamStub = sinon.stub(fs, 'createWriteStream').returns(mockStream);
    fetchStub = createFetchStub();
  });

  afterEach(() => {
    sinon.restore();
    imageData = null;
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
      await downloadImagesModule.downloadImage(
        { maxRetries: 3 },
        'http://example.com/image.jpg',
        '/content/dam/image.jpg',
      );

      expect(fetchStub).to.have.been.calledWith('http://example.com/image.jpg');

      const finalPath = path.join(process.cwd(), 'image.jpg');
      expect(createWriteStreamStub).to.have.been.calledWith(finalPath);

      // Ensure the image data was correctly written to the mock stream
      expect(imageData).to.equal('image data');
    });

    it('should retry download on failure', async () => {
      const badRequest = () => {
        return {
          ok: false,
          status: 404,
        }
      };

      fetchStub.callsFake(badRequest);

      await expect(
        downloadImagesModule.downloadImage({ maxRetries: 5 },
          'http://example.com/image.jpg',
          '/content/dam/image.jpg',
          0))
        .to.be.rejectedWith('Failed to fetch http://example.com/image.jpg. Status: 404.');

      // there should be 5 retry attempts
      expect(fetchStub).to.have.callCount(5);

      // because the image fails to download, the error message should be logged
      expectLogContains(consoleErrorStub, 'Failed to download')
    });
  });

  describe('downloadImagesInMarkdown', () => {
    it('should download images from markdown file', async () => {
      const mapFileContent = '{"http://example.com/image1.jpg":"/content/dam/image1.jpg"}';
      readFileSyncStub.returns(mapFileContent);

      fetchStub.callsFake(fetchHandler);

      createWriteStreamStub.returns({ on: sinon.stub().callsArg(1) });

      // test downloadImagesInMarkdown method
      await downloadImagesInMarkdown({ maxRetries: 3, downloadLocation: 'path/to/download' }, 'path/to/markdown.md');
      expect(fetchStub).to.have.been.calledWith('http://example.com/image1.jpg');
      expect(createWriteStreamStub).to.have.been.called;
      expect(createWriteStreamStub).to.have.callCount(3);
    });
  });
});
