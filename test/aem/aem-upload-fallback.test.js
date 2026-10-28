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
import { DirectBinaryUpload } from '@adobe/aem-upload';
import fs from 'node:fs/promises';
import nock from 'nock';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { ensureAemFolderExists, uploadFlatDirInBatches } from '../../src/aem/aem-upload-fallback.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const URL_PREFIX = 'https://author.example.com/content/dam';

describe('aem-upload-fallback', function () {
  let fetchStub;
  let uploadFilesStub;
  let uploadOptions;
  let testDir;

  beforeEach(async () => {
    uploadOptions = [];
    fetchStub = sinon.stub(global, 'fetch').resolves({ ok: true, status: 201, text: async () => '' });
    // Stub the real API so the tests break if the pinned @adobe/aem-upload changes it.
    uploadFilesStub = sinon.stub(DirectBinaryUpload.prototype, 'uploadFiles').callsFake(async function (opts) {
      uploadOptions.push(opts);
      const files = opts.getUploadFiles();
      files.forEach((file) => this.emit('fileend', { targetFile: new URL(file.fileUrl).pathname }));
      return { totalFiles: files.length, totalCompleted: files.length, errors: [] };
    });
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-fallback-test-'));
  });

  afterEach(async () => {
    sinon.restore();
    nock.cleanAll();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('uses the DirectBinaryUpload API of the pinned @adobe/aem-upload', () => {
    sinon.restore();
    expect(DirectBinaryUpload.prototype.uploadFiles).to.be.a('function');
  });

  describe('ensureAemFolderExists', () => {
    it('creates each folder level through the Assets HTTP API at the host root', async () => {
      await ensureAemFolderExists({
        urlPrefix: URL_PREFIX,
        relativeFolderPosix: 'xwalk/images',
        headers: { Authorization: 'Bearer token' },
      });

      const urls = fetchStub.getCalls().map((call) => call.args[0]);
      expect(urls).to.deep.equal([
        'https://author.example.com/api/assets/xwalk',
        'https://author.example.com/api/assets/xwalk/images',
      ]);
      const [, options] = fetchStub.firstCall.args;
      expect(options.method).to.equal('POST');
      expect(options.headers.Authorization).to.equal('Bearer token');
      expect(JSON.parse(options.body)).to.deep.equal({ class: 'assetFolder', properties: { 'jcr:title': 'xwalk' } });
    });

    it('encodes special characters in folder names', async () => {
      await ensureAemFolderExists({ urlPrefix: URL_PREFIX, relativeFolderPosix: 'a#b%c/é t', headers: {} });

      expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
        'https://author.example.com/api/assets/a%23b%25c',
        'https://author.example.com/api/assets/a%23b%25c/%C3%A9%20t',
      ]);
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
      const localDir = path.join(rootDir, 'images');
      await fs.mkdir(localDir);
      await fs.writeFile(path.join(localDir, 'a b.png'), 'a');
      await fs.writeFile(path.join(localDir, 'c#%é.jpg'), 'c');

      const results = await uploadFlatDirInBatches({ localDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
        'https://author.example.com/api/assets/xwalk',
        'https://author.example.com/api/assets/xwalk/images',
      ]);
      expect(results).to.deep.equal([{
        batchNumber: 1,
        filesInBatch: 2,
        filesUploaded: 2,
        filesFailed: 0,
        errors: [],
        result: { totalFiles: 2, totalCompleted: 2, errors: [] },
      }]);
      expect(uploadOptions).to.have.lengthOf(1);
      expect(uploadOptions[0].getUrl()).to.equal(URL_PREFIX);
      const fileUrls = uploadOptions[0].getUploadFiles().map((file) => file.fileUrl).sort();
      expect(fileUrls).to.deep.equal([
        `${URL_PREFIX}/xwalk/images/a%20b.png`,
        `${URL_PREFIX}/xwalk/images/c%23%25%C3%A9.jpg`,
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

    it('reports files that failed to upload', async () => {
      await fs.writeFile(path.join(rootDir, 'a.png'), 'a');
      await fs.writeFile(path.join(rootDir, 'b.png'), 'b');
      await fs.writeFile(path.join(rootDir, 'c.png'), 'c');
      uploadFilesStub.callsFake(async function () {
        this.emit('fileend', { targetFile: '/content/dam/xwalk/a.png' });
        this.emit('fileerror', { targetFile: '/content/dam/xwalk/b.png', errors: [{ message: 'failed' }] });
        return { totalFiles: 3, totalCompleted: 1, errors: [{ message: 'initiate failed' }] };
      });

      const [batch] = await uploadFlatDirInBatches({ localDir: rootDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(batch.filesUploaded).to.equal(1);
      expect(batch.filesFailed).to.equal(2);
      expect(batch.errors).to.deep.equal(['initiate failed']);
    });

    it('reports a batch that throws as entirely failed', async () => {
      await fs.writeFile(path.join(rootDir, 'a.png'), 'a');
      uploadFilesStub.rejects(new Error('network down'));

      const [batch] = await uploadFlatDirInBatches({ localDir: rootDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(batch).to.deep.equal({
        batchNumber: 1, filesInBatch: 1, filesUploaded: 0, filesFailed: 1, errors: ['network down'],
      });
    });

    it('counts uploaded files whose names the upload result misreports', async () => {
      // Run the real DirectBinaryUpload against a mocked AEM: in @adobe/aem-upload 2.0.3, totalCompleted
      // misses names with characters like `,` `+` `=` `;` `@` or `$`.
      uploadFilesStub.restore();
      const names = ['w_300,h_200.png', 'a+b=c;d@e$f.png', 'hero.png'];
      for (const name of names) {
        await fs.writeFile(path.join(rootDir, name), name);
      }
      let uploadIndex = 0;
      nock('https://author.example.com')
        .post('/content/dam/xwalk.initiateUpload.json')
        .times(names.length)
        .reply(200, (uri, body) => ({
          completeURI: '/content/dam/xwalk.completeUpload.json',
          folderPath: '/content/dam/xwalk',
          files: new URLSearchParams(body).getAll('fileName').map((fileName) => {
            uploadIndex += 1;
            return {
              fileName,
              mimeType: 'image/png',
              uploadToken: `token-${uploadIndex}`,
              uploadURIs: [`https://blob.example.com/upload-${uploadIndex}`],
              minPartSize: 1,
              maxPartSize: 1000000,
            };
          }),
        }))
        .post('/content/dam/xwalk.completeUpload.json')
        .times(names.length)
        .reply(200, {});
      const blob = nock('https://blob.example.com')
        .put(/\/upload-\d/)
        .times(names.length)
        .reply(201);

      const [batch] = await uploadFlatDirInBatches({ localDir: rootDir, rootDir, urlPrefix: URL_PREFIX, headers: {} });

      expect(blob.isDone()).to.be.true;
      expect(nock.pendingMocks().filter((m) => m.includes('completeUpload'))).to.deep.equal([]);
      expect(batch.result.totalCompleted).to.be.below(names.length);
      expect(batch).to.include({ filesInBatch: 3, filesUploaded: 3, filesFailed: 0 });
      expect(batch.errors).to.deep.equal([]);
    });
  });
});
