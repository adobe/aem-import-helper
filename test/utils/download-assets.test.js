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
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('download assets', function () {

  let downloadFolder;

  beforeEach(() => {
    downloadFolder = path.join(__dirname, 'assets');
  });

  afterEach(async () => {
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
      const scope = nock('http://www.aem.com')
        .get('/terms.docx')
        .reply(200, HTML_PAGE, { 'Content-Type': 'text/html' });

      const mapping = new Map([
        ['http://www.aem.com/terms.docx', '/content/dam/xwalk/terms.docx'],
      ]);

      const results = await downloadAssets(mapping, downloadFolder, 1, 0);

      expect(results[0].status).to.equal('fulfilled');
      expect(fs.readFileSync(path.join(downloadFolder, 'xwalk/terms.docx'), 'utf-8')).to.equal(HTML_PAGE);

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
