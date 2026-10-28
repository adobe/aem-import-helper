/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import esmock from 'esmock';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';

chai.use(chaiAsPromised);
const { expect } = chai;

const URL_PREFIX = 'https://author.example.com/content/dam';

describe('aem-upload-fallback', function () {
  let ensureAemFolderExists;
  let uploadFlatDirInBatches;
  let uploadOptions;
  let fetchStub;
  let testDir;

  before(async () => {
    class FakeDirectBinaryUpload {
      on() {}

      async upload(opts) {
        uploadOptions.push(opts);
        return {};
      }
    }

    ({ ensureAemFolderExists, uploadFlatDirInBatches } = await esmock('../../src/aem/aem-upload-fallback.js', {
      '@adobe/aem-upload': { DirectBinaryUpload: FakeDirectBinaryUpload },
    }));
  });

  beforeEach(async () => {
    uploadOptions = [];
    fetchStub = sinon.stub(global, 'fetch').resolves({ ok: true, status: 201, text: async () => '' });
    sinon.stub(console, 'log');
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-fallback-test-'));
  });

  afterEach(async () => {
    sinon.restore();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('ensureAemFolderExists', () => {
    it('creates each folder level through the Assets HTTP API at the host root', async () => {
      await ensureAemFolderExists({
        urlPrefix: URL_PREFIX,
        relativeFolderPosix: 'xwalk/my images',
        headers: { Authorization: 'Bearer token' },
      });

      const urls = fetchStub.getCalls().map((call) => call.args[0]);
      expect(urls).to.deep.equal([
        'https://author.example.com/api/assets/xwalk',
        'https://author.example.com/api/assets/xwalk/my%20images',
      ]);
      const [, options] = fetchStub.firstCall.args;
      expect(options.method).to.equal('POST');
      expect(options.headers.Authorization).to.equal('Bearer token');
      expect(JSON.parse(options.body)).to.deep.equal({ class: 'assetFolder', properties: { 'jcr:title': 'xwalk' } });
    });

    it('treats 409 as an existing folder', async () => {
      fetchStub.resolves({ ok: false, status: 409, statusText: 'Conflict', text: async () => '' });

      await expect(ensureAemFolderExists({
        urlPrefix: URL_PREFIX,
        relativeFolderPosix: 'xwalk',
        headers: {},
      })).to.be.fulfilled;
    });

    it('throws on other errors', async () => {
      fetchStub.resolves({ ok: false, status: 404, statusText: 'Not Found', text: async () => 'missing' });

      await expect(ensureAemFolderExists({
        urlPrefix: URL_PREFIX,
        relativeFolderPosix: 'xwalk',
        headers: {},
      })).to.be.rejectedWith('Failed to create AEM folder "xwalk" (404 Not Found): missing');
    });
  });

  describe('uploadFlatDirInBatches', () => {
    let rootDir;

    // As in production, rootDir is the DAM root folder itself (e.g. <output>/xwalk).
    beforeEach(async () => {
      rootDir = path.join(testDir, 'xwalk');
      await fs.mkdir(rootDir);
    });

    it('uploads files of a sub-folder to their /content/dam URLs after creating the folders', async () => {
      const localDir = path.join(rootDir, 'my images');
      await fs.mkdir(localDir);
      await fs.writeFile(path.join(localDir, 'a b.png'), 'a');
      await fs.writeFile(path.join(localDir, 'c.jpg'), 'c');

      const results = await uploadFlatDirInBatches({ localDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
        'https://author.example.com/api/assets/xwalk',
        'https://author.example.com/api/assets/xwalk/my%20images',
      ]);
      expect(results).to.have.lengthOf(1);
      expect(uploadOptions).to.have.lengthOf(1);
      expect(uploadOptions[0].getUrl()).to.equal(URL_PREFIX);
      const fileUrls = uploadOptions[0].getUploadFiles().map((file) => file.fileUrl).sort();
      expect(fileUrls).to.deep.equal([
        `${URL_PREFIX}/xwalk/my%20images/a%20b.png`,
        `${URL_PREFIX}/xwalk/my%20images/c.jpg`,
      ]);
    });

    it('uploads files of the root folder under the root folder name', async () => {
      await fs.writeFile(path.join(rootDir, 'root.png'), 'r');

      await uploadFlatDirInBatches({ localDir: rootDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
        'https://author.example.com/api/assets/xwalk',
      ]);
      expect(uploadOptions[0].getUploadFiles().map((file) => file.fileUrl)).to.deep.equal([
        `${URL_PREFIX}/xwalk/root.png`,
      ]);
    });

    it('splits uploads into batches', async () => {
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(path.join(rootDir, `file-${i}.png`), `${i}`);
      }

      const results = await uploadFlatDirInBatches({
        localDir: rootDir, rootDir, urlPrefix: URL_PREFIX, headers: {}, maxFilesPerBatch: 2,
      });

      expect(results).to.have.lengthOf(3);
      expect(uploadOptions.map((opts) => opts.getUploadFiles().length)).to.deep.equal([2, 2, 1]);
    });
  });
});
