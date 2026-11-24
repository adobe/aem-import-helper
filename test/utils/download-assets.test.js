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
import { cleanup, downloadAssets, getDownloadedPaths } from '../../src/utils/download-assets.js';
import esmock from 'esmock';
import nock from 'nock';
import path from 'path';
import sinon from 'sinon';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'node:os';
import zlib from 'node:zlib';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('download assets', function () {

  let downloadFolder;

  beforeEach(() => {
    downloadFolder = path.join(__dirname, 'assets');
  });

  afterEach(async () => {
    nock.cleanAll();
    await cleanup(downloadFolder);
  });

  it('expect download to be successful', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.jpg')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));

    const mapping = new Map([
      ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
    ]);

    await downloadAssets(mapping, downloadFolder, 3, 5000, {}, { convertImagesToPng: true });
    // jpeg should not be converted based on new rules
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

    await downloadAssets(mapping, downloadFolder, 3, 0, {}, { convertImagesToPng: true });
    // jpeg should not be converted based on new rules
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

    const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });
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
      await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });
    } catch (error) {
      expect(error.message).to.equal('Failed to fetch http://www.aem.com/asset1.jpg. Status: 404.');
    }

    await scope.done();
  });

  it('should save extensionless file without adding extension (extension added later before upload)', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'), {
        'Content-Type': 'image/jpeg',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1', '/content/dam/xwalk/image1'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    // File should be saved without extension; addExtensionsToFiles handles renaming before upload
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1'))).to.be.true;

    await scope.done();
  });

  it('should not add extension when file already has one', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1.png')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'), {
        'Content-Type': 'image/jpeg',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1.png', '/content/dam/xwalk/image1.png'],
    ]);

    await downloadAssets(mapping, downloadFolder, 3, 5000, {}, { convertImagesToPng: true });
    // png with existing extension should remain png
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

    await downloadAssets(mapping, downloadFolder, 3, 5000, {}, { convertImagesToPng: true });
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1'))).to.be.true;

    await scope.done();
  });

  it('should save extensionless file without extension even with content-type parameters (no conversion)', async () => {
    const scope = nock('http://www.aem.com')
      .get('/asset1')
      .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'), {
        'Content-Type': 'image/jpeg; charset=utf-8',
      });

    const mapping = new Map([
      ['http://www.aem.com/asset1', '/content/dam/xwalk/image1'],
    ]);

    await downloadAssets(mapping, downloadFolder);
    // File should be saved without extension; addExtensionsToFiles handles renaming before upload
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1'))).to.be.true;

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

    await downloadAssets(mapping, downloadFolder, 3, 5000, {}, { convertImagesToPng: true });
    // jpeg should not be converted based on new rules
    expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

    await scope.done();
  });

  describe('local assets (--local-assets)', () => {
    let localAssetsFolder;

    beforeEach(() => {
      localAssetsFolder = path.join(__dirname, 'local-assets-fixture');
      fs.mkdirSync(path.join(localAssetsFolder, 'content/dam/xwalk'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(localAssetsFolder, { recursive: true, force: true });
      fs.rmSync(downloadFolder, { recursive: true, force: true });
    });

    it('should copy local file when found (plain copy, no conversion)', async () => {
      // Place a JPEG in the local assets folder matching the DAM path
      fs.copyFileSync(
        path.resolve(__dirname, '../aem/fixtures/image1.jpeg'),
        path.join(localAssetsFolder, 'content/dam/xwalk/image1.jpg'),
      );

      const mapping = new Map([
        ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
        convertImagesToPng: false,
        localAssetsPath: localAssetsFolder,
      });

      expect(results.filter(r => r.status === 'fulfilled').length).to.equal(1);
      expect(results[0].value.local).to.be.true;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;
    });

    it('should convert local file to PNG when conversion is enabled and extension qualifies', async () => {
      // .webp is not in DO_NOT_CONVERT_EXTENSIONS, so it should be converted to PNG
      fs.copyFileSync(
        path.resolve(__dirname, '../aem/fixtures/image-local.webp'),
        path.join(localAssetsFolder, 'content/dam/xwalk/hero.webp'),
      );

      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/xwalk/hero.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
        convertImagesToPng: true,
        localAssetsPath: localAssetsFolder,
      });

      expect(results[0].value.local).to.be.true;
      // Should be converted to .png
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/hero.png'))).to.be.true;
      // Original .webp should NOT exist at destination
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/hero.webp'))).to.be.false;
    });

    it('should fall back to copying original when PNG conversion fails', async () => {
      // Create an invalid "webp" file that sharp cannot convert
      fs.writeFileSync(
        path.join(localAssetsFolder, 'content/dam/xwalk/bad.webp'),
        'not a real image',
      );

      const mapping = new Map([
        ['http://www.aem.com/bad.webp', '/content/dam/xwalk/bad.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
        convertImagesToPng: true,
        localAssetsPath: localAssetsFolder,
      });

      expect(results[0].value.local).to.be.true;
      // Falls back to copying the original file
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/bad.webp'))).to.be.true;
    });

    it('should fall back to remote download when local file is not found', async () => {
      // No local file exists, so it should download from the remote URL
      const scope = nock('http://www.aem.com')
        .get('/asset1.jpg')
        .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));

      const mapping = new Map([
        ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
        convertImagesToPng: false,
        localAssetsPath: localAssetsFolder,
      });

      expect(results[0].value.local).to.be.undefined;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/image1.jpg'))).to.be.true;

      await scope.done();
    });

    it('should respect useCache and not overwrite existing destination', async () => {
      // Pre-create the destination file
      fs.mkdirSync(path.join(downloadFolder, 'xwalk'), { recursive: true });
      fs.writeFileSync(path.join(downloadFolder, 'xwalk/image1.jpg'), 'existing content');

      // Place a different file in local assets
      fs.copyFileSync(
        path.resolve(__dirname, '../aem/fixtures/image1.jpeg'),
        path.join(localAssetsFolder, 'content/dam/xwalk/image1.jpg'),
      );

      const mapping = new Map([
        ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
        convertImagesToPng: false,
        localAssetsPath: localAssetsFolder,
        useCache: true,
      });

      expect(results[0].value.cached).to.be.true;
      // File should still contain the original content (not overwritten)
      const content = fs.readFileSync(path.join(downloadFolder, 'xwalk/image1.jpg'), 'utf-8');
      expect(content).to.equal('existing content');
    });
  });

  it('should process downloads in batches with controlled concurrency', async () => {
    // Create 15 assets to test batching with concurrency limit of 5
    const assets = Array.from({ length: 15 }, (_, i) => ({
      url: `http://www.aem.com/asset${i + 1}.jpg`,
      path: `/content/dam/xwalk/image${i + 1}.jpg`,
    }));

    const scope = nock('http://www.aem.com');
    assets.forEach((asset) => {
      scope
        .get(new URL(asset.url).pathname)
        .replyWithFile(200, path.resolve(__dirname, '../aem/fixtures/image1.jpeg'));
    });

    const mapping = new Map(assets.map(a => [a.url, a.path]));

    const results = await downloadAssets(mapping, downloadFolder, 3, 5000, {}, {
      convertImagesToPng: true,
      maxConcurrentDownloads: 5,
    });

    // All downloads should succeed
    expect(results.filter((result) => result.status === 'fulfilled').length).to.equal(15);
    expect(results.filter((result) => result.status === 'rejected').length).to.equal(0);

    // Verify all files were downloaded
    assets.forEach((asset) => {
      const filePath = path.join(downloadFolder, asset.path.replace('/content/dam/', ''));
      expect(fs.existsSync(filePath)).to.be.true;
    });

    await scope.done();
  });

  describe('downloaded bytes check', () => {
    const HTML_PAGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
    const imageFixture = (name) => path.resolve(__dirname, '../fixtures/images', name);

    it('rejects an HTML page downloaded for an image and writes nothing', async () => {
      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/plain' })
        .get('/banner.jpg')
        .reply(200, HTML_PAGE)
        .get('/teaser.webp')
        .reply(200, HTML_PAGE, { 'Content-Type': 'image/webp' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
        ['http://www.aem.com/banner.jpg', '/content/dam/xwalk/banner.jpg'],
        // .webp is converted to PNG, so this one goes through the conversion branch
        ['http://www.aem.com/teaser.webp', '/content/dam/xwalk/teaser.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results.map((result) => result.status)).to.deep.equal(['rejected', 'rejected', 'rejected']);
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/hero.jpg: expected an image but the download looks like an HTML page',
      );
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk'))).to.be.false;

      await scope.done();
    });

    it('rejects a short text body downloaded for an image', async () => {
      const body = 'Forbidden: request blocked by the WAF.';
      const scope = nock('http://www.aem.com')
        .get('/logo.png')
        .reply(200, body, { 'Content-Type': 'application/octet-stream' });

      const mapping = new Map([
        ['http://www.aem.com/logo.png', '/content/dam/xwalk/logo.png'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/logo.png: expected an image but the download looks like plain text of 38 bytes',
      );
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/logo.png'))).to.be.false;

      await scope.done();
    });

    it('accepts an image in another format than its extension, as served by content negotiation', async () => {
      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .replyWithFile(200, imageFixture('sample.webp'), { 'Content-Type': 'image/webp' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results[0].status).to.equal('fulfilled');
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/hero.jpg')))
        .to.deep.equal(fs.readFileSync(imageFixture('sample.webp')));

      await scope.done();
    });

    it('accepts an SVG image', async () => {
      const scope = nock('http://www.aem.com')
        .get('/icon.svg')
        .replyWithFile(200, imageFixture('sample-xml.svg'), { 'Content-Type': 'image/svg+xml' });

      const mapping = new Map([
        ['http://www.aem.com/icon.svg', '/content/dam/xwalk/icon.svg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results[0].status).to.equal('fulfilled');
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/icon.svg'))).to.be.true;

      await scope.done();
    });

    it('accepts a PDF and rejects an HTML page downloaded for a PDF', async () => {
      const scope = nock('http://www.aem.com')
        .get('/brochure.pdf')
        .reply(200, '%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', { 'Content-Type': 'application/pdf' })
        .get('/flyer.pdf')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/brochure.pdf', '/content/dam/xwalk/brochure.pdf'],
        ['http://www.aem.com/flyer.pdf', '/content/dam/xwalk/flyer.pdf'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'rejected']);
      expect(results[1].reason.message).to.equal(
        'Rejected http://www.aem.com/flyer.pdf: expected a PDF but the download looks like an HTML page',
      );
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/brochure.pdf'))).to.be.true;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/flyer.pdf'))).to.be.false;

      await scope.done();
    });

    it('checks an extensionless download against its content type', async () => {
      const scope = nock('http://www.aem.com')
        .get('/media/hero')
        .reply(200, HTML_PAGE, { 'Content-Type': 'image/png' });

      const mapping = new Map([
        ['http://www.aem.com/media/hero', '/content/dam/xwalk/hero'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/media/hero: expected an image but the download looks like an HTML page',
      );
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/hero'))).to.be.false;

      await scope.done();
    });

    it('does not check downloads of a kind of file it cannot recognise', async () => {
      const psd = Buffer.from('8BPS\u0000\u0001\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1');
      const scope = nock('http://www.aem.com')
        .get('/terms.docx')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' })
        .get('/brand.psd')
        .reply(200, psd, { 'Content-Type': 'image/vnd.adobe.photoshop' });

      const mapping = new Map([
        ['http://www.aem.com/terms.docx', '/content/dam/xwalk/terms.docx'],
        ['http://www.aem.com/brand.psd', '/content/dam/xwalk/brand.psd'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'fulfilled']);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/terms.docx'), 'utf-8')).to.equal(HTML_PAGE);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/brand.psd'))).to.deep.equal(psd);

      await scope.done();
    });

    it('removes a file an earlier run left where a rejected download would go', async () => {
      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });
      const stale = path.join(downloadFolder, 'xwalk/hero.jpg');
      fs.mkdirSync(path.dirname(stale), { recursive: true });
      fs.writeFileSync(stale, 'Forbidden: request blocked by the WAF.');

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(fs.existsSync(stale)).to.be.false;

      await scope.done();
    });

    it('removes a stale converted .png on rejection even when the rejected response sends Content-Type: image/png', async () => {
      const scope = nock('http://www.aem.com')
        .get('/hero.webp')
        .reply(200, HTML_PAGE, { 'Content-Type': 'image/png' })
        .get('/media/banner')
        .reply(200, HTML_PAGE, { 'Content-Type': 'Image/WebP' });
      const staleHeroPng = path.join(downloadFolder, 'xwalk/hero.png');
      const staleBannerPng = path.join(downloadFolder, 'xwalk/banner.png');
      fs.mkdirSync(path.dirname(staleHeroPng), { recursive: true });
      fs.writeFileSync(staleHeroPng, 'stale converted hero');
      fs.writeFileSync(staleBannerPng, 'stale converted banner');

      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/xwalk/hero.webp'],
        ['http://www.aem.com/media/banner', '/content/dam/xwalk/banner'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results.map((result) => result.status)).to.deep.equal(['rejected', 'rejected']);
      expect(fs.existsSync(staleHeroPng)).to.be.false;
      expect(fs.existsSync(staleBannerPng)).to.be.false;

      await scope.done();
    });

    it('preserves a cached converted .png when useCache and convertImagesToPng are both enabled', async () => {
      const cachedPng = path.join(downloadFolder, 'xwalk/hero.png');
      const cachedBytes = fs.readFileSync(imageFixture('sample.png'));
      fs.mkdirSync(path.dirname(cachedPng), { recursive: true });
      fs.writeFileSync(cachedPng, cachedBytes);

      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/xwalk/hero.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
        convertImagesToPng: true,
        useCache: true,
      });

      expect(results[0].status).to.equal('fulfilled');
      expect(results[0].value.cached).to.be.true;
      expect(fs.readFileSync(cachedPng)).to.deep.equal(cachedBytes);
    });

    it('accepts a gzipped .svgz file served with Content-Type: image/svg+xml', async () => {
      const svgz = zlib.gzipSync(fs.readFileSync(imageFixture('sample.svg')));
      const scope = nock('http://www.aem.com')
        .get('/diagram.svgz')
        .reply(200, svgz, { 'Content-Type': 'image/svg+xml' });

      const mapping = new Map([
        ['http://www.aem.com/diagram.svgz', '/content/dam/xwalk/diagram.svgz'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results[0].status).to.equal('fulfilled');
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/diagram.svgz'))).to.deep.equal(svgz);
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/diagram.png'))).to.be.false;

      await scope.done();
    });

    it('accepts an MP4 video and rejects HTML or AVIF served as an MP4', async () => {
      const mp4 = Buffer.from('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom', 'latin1');
      const scope = nock('http://www.aem.com')
        .get('/clip.mp4')
        .reply(200, mp4, { 'Content-Type': 'video/mp4' })
        .get('/media/stream')
        .reply(200, mp4, { 'Content-Type': 'video/mp4' })
        .get('/broken.mp4')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' })
        .get('/wrong.mp4')
        .replyWithFile(200, imageFixture('sample.avif'), { 'Content-Type': 'video/mp4' });

      const mapping = new Map([
        ['http://www.aem.com/clip.mp4', '/content/dam/xwalk/clip.mp4'],
        ['http://www.aem.com/media/stream', '/content/dam/xwalk/stream'],
        ['http://www.aem.com/broken.mp4', '/content/dam/xwalk/broken.mp4'],
        ['http://www.aem.com/wrong.mp4', '/content/dam/xwalk/wrong.mp4'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'fulfilled', 'rejected', 'rejected']);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/clip.mp4'))).to.deep.equal(mp4);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/stream'))).to.deep.equal(mp4);
      expect(results[2].reason.message).to.equal(
        'Rejected http://www.aem.com/broken.mp4: expected an MP4 video but the download looks like an HTML page',
      );
      expect(results[3].reason.message).to.equal(
        'Rejected http://www.aem.com/wrong.mp4: expected an MP4 video but the download looks like an image (AVIF)',
      );

      await scope.done();
    });

    it('rejects download paths that escape downloadFolder without touching external files', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'download-assets-traversal-'));
      const isolatedDownloadFolder = path.join(tempRoot, 'assets');
      const outsideFile = path.join(tempRoot, 'victim.jpg');
      const outsidePng = path.join(tempRoot, 'victim.png');
      fs.writeFileSync(outsideFile, 'do not delete');
      fs.writeFileSync(outsidePng, 'do not delete png');
      const errorStub = sinon.stub(console, 'error');
      try {
        const scope = nock('http://www.aem.com')
          .get('/evil.jpg')
          .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

        const mapping = new Map([
          ['http://www.aem.com/evil.jpg', '/content/dam/../victim.jpg'],
        ]);

        const results = await downloadAssets(mapping, isolatedDownloadFolder, 1, 0, {}, { convertImagesToPng: true });

        expect(results[0].status).to.equal('rejected');
        expect(results[0].reason.message).to.include('resolves outside download folder');
        expect(errorStub.calledWithMatch(/resolves outside download folder/)).to.be.true;
        expect(fs.readFileSync(outsideFile, 'utf-8')).to.equal('do not delete');
        expect(fs.readFileSync(outsidePng, 'utf-8')).to.equal('do not delete png');

        await scope.done();
      } finally {
        errorStub.restore();
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('preserves the rejection error when the target path is an existing directory', async () => {
      const existingDir = path.join(downloadFolder, 'xwalk/hero.jpg');
      fs.mkdirSync(existingDir, { recursive: true });

      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/hero.jpg: expected an image but the download looks like an HTML page',
      );
      expect(fs.statSync(existingDir).isDirectory()).to.be.true;

      await scope.done();
    });

    it('does not log a successful download before byte validation passes', async () => {
      const logStub = sinon.stub(console, 'log');
      try {
        const scope = nock('http://www.aem.com')
          .get('/bad.jpg')
          .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

        const mapping = new Map([
          ['http://www.aem.com/bad.jpg', '/content/dam/xwalk/bad.jpg'],
        ]);

        const results = await downloadAssets(mapping, downloadFolder, 1, 0);

        expect(results[0].status).to.equal('rejected');
        const logged = logStub.args.map((args) => args.join(' '));
        expect(logged.some((line) => line.includes('Downloaded successfully'))).to.be.false;

        await scope.done();
      } finally {
        logStub.restore();
      }
    });

    it('converts a valid .webp download to .png when convertImagesToPng is enabled', async () => {
      const scope = nock('http://www.aem.com')
        .get('/hero.webp')
        .replyWithFile(200, imageFixture('sample.webp'), { 'Content-Type': 'image/webp' });

      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/xwalk/hero.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results[0].status).to.equal('fulfilled');
      const pngPath = path.join(downloadFolder, 'xwalk/hero.png');
      expect(fs.existsSync(pngPath)).to.be.true;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/hero.webp'))).to.be.false;
      // PNG magic bytes
      expect(fs.readFileSync(pngPath).subarray(0, 8))
        .to.deep.equal(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

      await scope.done();
    });

    it('falls back to saving the original bytes when sharp cannot convert a valid-signature image', async () => {
      const icoBytes = fs.readFileSync(imageFixture('sample.ico'));
      const scope = nock('http://www.aem.com')
        .get('/icon.webp')
        .reply(200, icoBytes, { 'Content-Type': 'image/webp' });

      const mapping = new Map([
        ['http://www.aem.com/icon.webp', '/content/dam/xwalk/icon.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results[0].status).to.equal('fulfilled');
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/icon.webp'))).to.deep.equal(icoBytes);
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/icon.png'))).to.be.false;

      await scope.done();
    });

    it('saves unchecked image/* types like PSD without running PNG conversion', async () => {
      const psd = Buffer.from('8BPS\u0000\u0001\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1');
      const warnStub = sinon.stub(console, 'warn');
      try {
        const scope = nock('http://www.aem.com')
          .get('/brand.psd')
          .reply(200, psd, { 'Content-Type': 'image/vnd.adobe.photoshop' });

        const mapping = new Map([
          ['http://www.aem.com/brand.psd', '/content/dam/xwalk/brand.psd'],
        ]);

        const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

        expect(results[0].status).to.equal('fulfilled');
        expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/brand.psd'))).to.deep.equal(psd);
        expect(fs.existsSync(path.join(downloadFolder, 'xwalk/brand.png'))).to.be.false;
        expect(warnStub.called).to.be.false;

        await scope.done();
      } finally {
        warnStub.restore();
      }
    });

    it('rejects a 200 empty response for an image', async () => {
      const scope = nock('http://www.aem.com')
        .get('/empty.jpg')
        .reply(200, Buffer.alloc(0), { 'Content-Type': 'image/jpeg' });

      const mapping = new Map([
        ['http://www.aem.com/empty.jpg', '/content/dam/xwalk/empty.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/empty.jpg: expected an image but the download is empty',
      );
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/empty.jpg'))).to.be.false;

      await scope.done();
    });

    it('checks .tif, .jxl and .jp2 downloads even when served as text/html', async () => {
      const scope = nock('http://www.aem.com')
        .get('/photo.tif')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' })
        .get('/photo.jxl')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' })
        .get('/photo.jp2')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/photo.tif', '/content/dam/xwalk/photo.tif'],
        ['http://www.aem.com/photo.jxl', '/content/dam/xwalk/photo.jxl'],
        ['http://www.aem.com/photo.jp2', '/content/dam/xwalk/photo.jp2'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results.map((result) => result.status)).to.deep.equal(['rejected', 'rejected', 'rejected']);
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk'))).to.be.false;

      await scope.done();
    });

    it('preserves a sibling .png when rejecting an extensionless PDF/MP4 or a same-run .png mapping', async () => {
      const pngBytes = fs.readFileSync(imageFixture('sample.png'));
      const scope = nock('http://www.aem.com')
        .get('/report.png')
        .reply(200, pngBytes, { 'Content-Type': 'image/png' })
        .get('/media/report')
        .reply(200, HTML_PAGE, { 'Content-Type': 'application/pdf' })
        .get('/hero.png')
        .reply(200, pngBytes, { 'Content-Type': 'image/png' })
        .get('/hero.webp')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/report.png', '/content/dam/xwalk/report.png'],
        ['http://www.aem.com/media/report', '/content/dam/xwalk/report'],
        ['http://www.aem.com/hero.png', '/content/dam/xwalk/hero.png'],
        ['http://www.aem.com/hero.webp', '/content/dam/xwalk/hero.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
        convertImagesToPng: true,
        maxConcurrentDownloads: 1,
      });

      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'rejected', 'fulfilled', 'rejected']);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/report.png'))).to.deep.equal(pngBytes);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/hero.png'))).to.deep.equal(pngBytes);

      await scope.done();
    });

    it('does not skip non-image downloads as cached when a sibling .png exists under useCache', async () => {
      const pngBytes = fs.readFileSync(imageFixture('sample.png'));
      const psdBytes = Buffer.from('8BPS\u0000\u0001\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1');
      const svgzBytes = zlib.gzipSync(fs.readFileSync(imageFixture('sample.svg')));
      const zipBytes = Buffer.from('PK\x03\x04zipdata', 'latin1');
      const existingPng = path.join(downloadFolder, 'xwalk/brand.png');
      fs.mkdirSync(path.dirname(existingPng), { recursive: true });
      fs.writeFileSync(existingPng, pngBytes);

      const scope = nock('http://www.aem.com')
        .get('/brand.zip')
        .reply(200, zipBytes, { 'Content-Type': 'application/zip' })
        .get('/brand.psd')
        .reply(200, psdBytes, { 'Content-Type': 'image/vnd.adobe.photoshop' })
        .get('/brand.svgz')
        .reply(200, svgzBytes, { 'Content-Type': 'image/svg+xml' });

      const mapping = new Map([
        ['http://www.aem.com/brand.zip', '/content/dam/xwalk/brand.zip'],
        ['http://www.aem.com/brand.psd', '/content/dam/xwalk/brand.psd'],
        ['http://www.aem.com/brand.svgz', '/content/dam/xwalk/brand.svgz'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
        convertImagesToPng: true,
        useCache: true,
      });

      expect(results.map((result) => ({ status: result.status, cached: result.value?.cached }))).to.deep.equal([
        { status: 'fulfilled', cached: false },
        { status: 'fulfilled', cached: false },
        { status: 'fulfilled', cached: false },
      ]);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/brand.zip'))).to.deep.equal(zipBytes);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/brand.psd'))).to.deep.equal(psdBytes);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/brand.svgz'))).to.deep.equal(svgzBytes);

      await scope.done();
    });

    it('rejects SVG bytes served for a raster image extension or raster content type', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .reply(200, svg, { 'Content-Type': 'image/svg+xml' })
        .get('/media/hero')
        .reply(200, svg, { 'Content-Type': 'image/jpeg' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
        ['http://www.aem.com/media/hero', '/content/dam/xwalk/hero'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results.map((result) => result.status)).to.deep.equal(['rejected', 'rejected']);
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk'))).to.be.false;

      await scope.done();
    });

    it('preserves the rejection error when a parent path component is a regular file (ENOTDIR)', async () => {
      fs.mkdirSync(downloadFolder, { recursive: true });
      fs.writeFileSync(path.join(downloadFolder, 'xwalk'), 'not a directory');

      const scope = nock('http://www.aem.com')
        .get('/hero.jpg')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg', '/content/dam/xwalk/hero.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('rejected');
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/hero.jpg: expected an image but the download looks like an HTML page',
      );

      await scope.done();
    });

    it('does not retry a 200 response rejected by byte validation', async () => {
      const scope = nock('http://www.aem.com')
        .get('/blocked.jpg')
        .once()
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/blocked.jpg', '/content/dam/xwalk/blocked.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 3, 0);

      expect(results[0].status).to.equal('rejected');
      await scope.done();
    });

    it('rejects non-SVG bytes for .svg and extensionless image/svg+xml while preserving valid SVGs', async () => {
      const pngBytes = fs.readFileSync(imageFixture('sample.png'));
      const svgBytes = fs.readFileSync(imageFixture('sample-xml.svg'));
      const existingSiblingPng = path.join(downloadFolder, 'xwalk/bad-vector.png');
      fs.mkdirSync(path.dirname(existingSiblingPng), { recursive: true });
      fs.writeFileSync(existingSiblingPng, pngBytes);

      const scope = nock('http://www.aem.com')
        .get('/icon.svg')
        .reply(200, pngBytes, { 'Content-Type': 'image/png' })
        .get('/media/good-vector')
        .reply(200, svgBytes, { 'Content-Type': 'image/svg+xml' })
        .get('/media/bad-vector')
        .reply(200, HTML_PAGE, { 'Content-Type': 'image/svg+xml' });

      const mapping = new Map([
        ['http://www.aem.com/icon.svg', '/content/dam/xwalk/icon.svg'],
        ['http://www.aem.com/media/good-vector', '/content/dam/xwalk/good-vector'],
        ['http://www.aem.com/media/bad-vector', '/content/dam/xwalk/bad-vector'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, { convertImagesToPng: true });

      expect(results.map((result) => result.status)).to.deep.equal(['rejected', 'fulfilled', 'rejected']);
      expect(results[0].reason.message).to.equal(
        'Rejected http://www.aem.com/icon.svg: expected an SVG image but the download looks like an image (PNG)',
      );
      expect(results[2].reason.message).to.equal(
        'Rejected http://www.aem.com/media/bad-vector: expected an SVG image but the download looks like an HTML page',
      );
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/good-vector'))).to.deep.equal(svgBytes);
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/good-vector.png'))).to.be.false;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/icon.svg'))).to.be.false;
      expect(fs.existsSync(path.join(downloadFolder, 'xwalk/bad-vector'))).to.be.false;
      // Rejecting an extensionless SVG must not delete an unrelated sibling .png
      expect(fs.readFileSync(existingSiblingPng)).to.deep.equal(pngBytes);

      await scope.done();
    });

    it('uses a cached converted .png for an extensionless convertible image under useCache', async () => {
      const cachedPng = path.join(downloadFolder, 'xwalk/banner.png');
      const cachedBytes = fs.readFileSync(imageFixture('sample.png'));
      fs.mkdirSync(path.dirname(cachedPng), { recursive: true });
      fs.writeFileSync(cachedPng, cachedBytes);

      const logStub = sinon.stub(console, 'log');
      try {
        const scope = nock('http://www.aem.com')
          .get('/media/banner')
          .replyWithFile(200, imageFixture('sample.webp'), { 'Content-Type': 'image/webp' });

        const mapping = new Map([
          ['http://www.aem.com/media/banner', '/content/dam/xwalk/banner'],
        ]);

        const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
          convertImagesToPng: true,
          useCache: true,
        });

        expect(results[0].status).to.equal('fulfilled');
        expect(results[0].value.cached).to.be.true;
        expect(fs.readFileSync(cachedPng)).to.deep.equal(cachedBytes);
        expect(fs.existsSync(path.join(downloadFolder, 'xwalk/banner'))).to.be.false;
        const logged = logStub.args.map((args) => args.join(' '));
        expect(logged.some((line) => line.includes('Downloaded successfully'))).to.be.false;

        await scope.done();
      } finally {
        logStub.restore();
      }
    });

    it('keeps a file written earlier in the same run when another URL mapping to the same path is rejected', async () => {
      const jpegBytes = fs.readFileSync(imageFixture('sample.jpg'));
      const scope = nock('http://www.aem.com')
        .get('/hero.jpg?w=1500')
        .reply(200, jpegBytes, { 'Content-Type': 'image/jpeg' })
        .get('/hero.jpg?w=750')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/hero.jpg?w=1500', '/content/dam/xwalk/hero.jpg'],
        ['http://www.aem.com/hero.jpg?w=750', '/content/dam/xwalk/hero.jpg'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
        maxConcurrentDownloads: 1,
      });

      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'rejected']);
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/hero.jpg'))).to.deep.equal(jpegBytes);

      await scope.done();
    });

    it('keeps a converted .png written earlier in the same run when another URL mapping to the same path is rejected', async () => {
      const webpBytes = fs.readFileSync(imageFixture('sample.webp'));
      const scope = nock('http://www.aem.com')
        .get('/hero.webp?w=1500')
        .reply(200, webpBytes, { 'Content-Type': 'image/webp' })
        .get('/hero.webp?w=750')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/hero.webp?w=1500', '/content/dam/xwalk/hero.webp'],
        ['http://www.aem.com/hero.webp?w=750', '/content/dam/xwalk/hero.webp'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0, {}, {
        convertImagesToPng: true,
        maxConcurrentDownloads: 1,
      });

      const convertedPath = path.join(downloadFolder, 'xwalk/hero.png');
      expect(results.map((result) => result.status)).to.deep.equal(['fulfilled', 'rejected']);
      expect(fs.existsSync(convertedPath)).to.be.true;
      expect(fs.readFileSync(convertedPath).subarray(0, 8)).to.deep.equal(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );

      await scope.done();
    });
  });

  describe('cleanup', () => {
    it('deletes the folder before resolving', async () => {
      fs.mkdirSync(path.join(downloadFolder, 'xwalk'), { recursive: true });
      fs.writeFileSync(path.join(downloadFolder, 'xwalk', 'image1.jpg'), 'data');

      await cleanup(downloadFolder);

      expect(fs.existsSync(downloadFolder)).to.be.false;
    });

    it('resolves when the folder does not exist', async () => {
      await cleanup(path.join(downloadFolder, 'missing'));
    });
  });

  describe('getDownloadedPaths', () => {
    it('returns the top-level folders written for the asset mapping', () => {
      const mapping = new Map([
        ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
        ['http://www.aem.com/asset2.jpg', '/content/dam/xwalk/sub/image2.jpg'],
        ['http://www.aem.com/asset3.jpg', '/content/dam/other/image3.jpg'],
      ]);

      expect(getDownloadedPaths(mapping, downloadFolder)).to.deep.equal([
        path.join(downloadFolder, 'xwalk'),
        path.join(downloadFolder, 'other'),
      ]);
    });

    it('returns files under the DAM root and their PNG variant when images are converted', () => {
      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/hero.webp'],
      ]);

      expect(getDownloadedPaths(mapping, downloadFolder, { convertImagesToPng: true })).to.deep.equal([
        path.join(downloadFolder, 'hero.webp'),
        path.join(downloadFolder, 'hero.png'),
      ]);
    });

    it('does not return a PNG variant when images are not converted', () => {
      const mapping = new Map([
        ['http://www.aem.com/hero.webp', '/content/dam/hero.webp'],
      ]);

      expect(getDownloadedPaths(mapping, downloadFolder)).to.deep.equal([
        path.join(downloadFolder, 'hero.webp'),
      ]);
    });

    it('ignores paths that would escape the download folder on Windows', async () => {
      const { getDownloadedPaths: getWin32DownloadedPaths } = await esmock('../../src/utils/download-assets.js', {
        path: path.win32,
      });
      const mapping = new Map([
        ['http://www.aem.com/a.jpg', '/content/dam/a\\..\\..\\Documents/a.jpg'],
        ['http://www.aem.com/b.jpg', '/content/dam/..\\b.jpg'],
        ['http://www.aem.com/c.jpg', '/content/dam/xwalk/c.jpg'],
      ]);

      expect(getWin32DownloadedPaths(mapping, 'C:\\work\\out', { convertImagesToPng: true })).to.deep.equal([
        'C:\\work\\out\\xwalk',
      ]);
    });

    it('ignores paths that would escape the download folder', () => {
      const mapping = new Map([
        ['http://www.aem.com/a.jpg', '/content/dam/../a.jpg'],
        ['http://www.aem.com/b.jpg', '/content/dam'],
      ]);

      expect(getDownloadedPaths(mapping, downloadFolder)).to.deep.equal([]);
    });

    it('does not include other files of the download folder', async () => {
      const zipPath = path.join(downloadFolder, 'package.zip');
      fs.mkdirSync(path.join(downloadFolder, 'xwalk'), { recursive: true });
      fs.writeFileSync(path.join(downloadFolder, 'xwalk', 'image1.jpg'), 'data');
      fs.writeFileSync(zipPath, 'zip');
      const mapping = new Map([
        ['http://www.aem.com/asset1.jpg', '/content/dam/xwalk/image1.jpg'],
      ]);

      for (const downloadedPath of getDownloadedPaths(mapping, downloadFolder)) {
        await cleanup(downloadedPath);
      }

      expect(fs.existsSync(path.join(downloadFolder, 'xwalk'))).to.be.false;
      expect(fs.existsSync(zipPath)).to.be.true;
    });
  });
});
