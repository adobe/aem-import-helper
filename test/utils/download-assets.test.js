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
import { cleanup, downloadAssets } from '../../src/utils/download-assets.js';
import nock from 'nock';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('download assets', function () {

  let downloadFolder;

  beforeEach(() => {
    downloadFolder = path.join(__dirname, 'assets');
  });

  afterEach(() => {
    cleanup(downloadFolder);
  });

  it('expect download to be successful', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

  it('expect download to be successful after retry', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .replyWithError('Server error')
      .get('/asset1.jpg')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
    ]);

    await downloadAssets(mapping, downloadFolder, 3, 0);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

  // write a test that expect to exhaust retires and throw error
  it('expect download to fail after max retries', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .replyWithError('Server error')
      .get('/asset2.jpg')
      .replyWithError('Server error')
      .get('/asset3.jpg')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image3.jpeg'));

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
      ['http://www.aem.com/asset2.jpg', '/content/dam/xwalk/image2.jpg'],
      ['http://www.aem.com/asset3.jpg', '/content/dam/xwalk/image3.jpg'],
    ]);

    const results = await downloadAssets(mapping, downloadFolder, 1, 0);
    expect(results.filter((result) => result.status === 'rejected').length).to.equal(2);
    expect(results.filter((result) => result.status === 'fulfilled').length).to.equal(1);

    await scope.done();
  });

  it('expect download to fail with bad response', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .reply(404);

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
    ]);

    try {
      await downloadAssets(mapping, downloadFolder, 1, 0);
    } catch (error) {
      expect(error.message).to.equal('Failed to fetch http://www.aem.com/asset1.jpg. Status: 404.');
    }

    await scope.done();
  });

  it('should add extension based on content-type when file has no extension', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1')
      .reply(200, 'image data', {
        'Content-Type': 'image/jpeg',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1', '/content/dam/xwalk/image1'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

  it('should not add extension when file already has one', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.png')
      .reply(200, 'image data', {
        'Content-Type': 'image/jpeg',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1.png', '/content/dam/xwalk/image1.png'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.png'))).to.be.true;

    await scope.done();
  });

  it('should handle unknown content-types gracefully', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1')
      .reply(200, 'data', {
        'Content-Type': 'application/unknown',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1', '/content/dam/xwalk/image1'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1'))).to.be.true;

    await scope.done();
  });

  it('should handle content-type with parameters', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1')
      .reply(200, 'image data', {
        'Content-Type': 'image/jpeg; charset=utf-8',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1', '/content/dam/xwalk/image1'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

  it('should include correct default headers in the request', async () => {
    const expectedHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': '*/*',
      'Referer': 'http://www.aem.com',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'no-cors',
    };

    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .matchHeader('User-Agent', expectedHeaders['User-Agent'])
      .matchHeader('Accept', expectedHeaders['Accept'])
      .matchHeader('Referer', expectedHeaders['Referer'])
      .matchHeader('Sec-Fetch-Site', expectedHeaders['Sec-Fetch-Site'])
      .matchHeader('Sec-Fetch-Mode', expectedHeaders['Sec-Fetch-Mode'])
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

});
