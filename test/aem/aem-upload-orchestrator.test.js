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
import { expect } from 'chai';
import { FileSystemUploadOptions } from '@adobe/aem-upload';
import esmock from 'esmock';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';

const URL_PREFIX = 'https://author.example.com/content/dam';

describe('uploadDirWithSplitAndFallback', function () {
  let uploadDirWithSplitAndFallback;
  let uploadFlatDirInBatchesStub;
  let testDir;
  let rootDir;

  beforeEach(async () => {
    uploadFlatDirInBatchesStub = sinon.stub().resolves([]);
    ({ uploadDirWithSplitAndFallback } = await esmock('../../src/aem/aem-upload-orchestrator.js', {
      '../../src/aem/aem-upload-fallback.js': { uploadFlatDirInBatches: uploadFlatDirInBatchesStub },
    }));
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-orchestrator-test-'));
    rootDir = path.join(testDir, 'xwalk');
    await fs.mkdir(path.join(rootDir, 'images', 'nested'), { recursive: true });
  });

  afterEach(async () => {
    sinon.restore();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('uploads split sub-directories into their parent folder under /content/dam', async () => {
    const options = new FileSystemUploadOptions().withUrl(URL_PREFIX).withMaxConcurrent(3);
    const uploads = [];
    const fileUpload = {
      upload: async (opts, [dir]) => {
        uploads.push({ dir: path.relative(testDir, dir), url: opts.getUrl(), maxConcurrent: opts.getMaxConcurrent() });
        if (dir !== path.join(rootDir, 'images', 'nested')) {
          throw Object.assign(new Error('too many files'), { code: 'TOO_LARGE' });
        }
        return {};
      },
    };

    const result = await uploadDirWithSplitAndFallback({
      fileUpload, options, urlPrefix: URL_PREFIX, headers: {}, assetRootDir: rootDir, dir: rootDir,
    });

    expect(result.ok).to.be.true;
    // Parent folder names are used as-is. FileSystemUpload would normalize them (lowercase, invalid
    // characters replaced), a known difference for names that need it.
    expect(uploads).to.deep.equal([
      { dir: 'xwalk', url: URL_PREFIX, maxConcurrent: 3 },
      { dir: path.join('xwalk', 'images'), url: `${URL_PREFIX}/xwalk`, maxConcurrent: 3 },
      { dir: path.join('xwalk', 'images', 'nested'), url: `${URL_PREFIX}/xwalk/images`, maxConcurrent: 3 },
    ]);
    expect(options.getUrl()).to.equal(URL_PREFIX);
    expect(uploadFlatDirInBatchesStub.getCalls().map((call) => path.relative(testDir, call.args[0].localDir)))
      .to.deep.equal(['xwalk', path.join('xwalk', 'images')]);
    expect(uploadFlatDirInBatchesStub.getCalls().every((call) => call.args[0].rootDir === rootDir)).to.be.true;
  });

  it('reports files that FileSystemUpload failed to upload', async () => {
    // totalCompleted is ignored: successful files are counted from 'fileend' events.
    const fileUpload = new EventEmitter();
    fileUpload.upload = async () => {
      fileUpload.emit('fileend', {});
      return { totalFiles: 4, totalCompleted: 4, errors: [{ message: 'folder creation failed' }] };
    };

    const result = await uploadDirWithSplitAndFallback({
      fileUpload, options: new FileSystemUploadOptions().withUrl(URL_PREFIX), urlPrefix: URL_PREFIX, headers: {},
      assetRootDir: rootDir, dir: rootDir,
    });

    expect(result.ok).to.be.false;
    expect(result.errors).to.deep.equal([{
      type: 'filesystem-upload',
      path: rootDir,
      message: '3 of 4 file(s) failed to upload; folder creation failed',
    }]);
    expect(result.filesystemRuns[0]).to.include({ filesUploaded: 1, filesFailed: 3 });
  });

  it('reports failed fallback batches', async () => {
    const fileUpload = {
      upload: async () => {
        throw Object.assign(new Error('too many files'), { code: 'TOO_LARGE' });
      },
    };
    await fs.rm(path.join(rootDir, 'images'), { recursive: true });
    uploadFlatDirInBatchesStub.resolves([
      { batchNumber: 1, filesInBatch: 2, filesUploaded: 2, filesFailed: 0, errors: [] },
      { batchNumber: 2, filesInBatch: 2, filesUploaded: 0, filesFailed: 2, errors: ['network down'] },
    ]);

    const result = await uploadDirWithSplitAndFallback({
      fileUpload, options: new FileSystemUploadOptions().withUrl(URL_PREFIX), urlPrefix: URL_PREFIX, headers: {},
      assetRootDir: rootDir, dir: rootDir,
    });

    expect(result.ok).to.be.false;
    expect(result.fallbackRuns).to.have.lengthOf(2);
    expect(result.errors).to.deep.equal([{
      type: 'fallback-flatdir',
      path: rootDir,
      message: 'batch 2: 2 of 2 file(s) failed to upload; network down',
    }]);
  });

  it('counts files that completed even when the upload result misreports them', async () => {
    const fileUpload = new EventEmitter();
    fileUpload.upload = async () => {
      fileUpload.emit('fileend', { targetFile: '/content/dam/xwalk/w_300,h_200.png' });
      fileUpload.emit('fileend', { targetFile: '/content/dam/xwalk/hero.png' });
      return { totalFiles: 2, totalCompleted: 1, errors: [] };
    };

    const result = await uploadDirWithSplitAndFallback({
      fileUpload, options: new FileSystemUploadOptions().withUrl(URL_PREFIX), urlPrefix: URL_PREFIX, headers: {},
      assetRootDir: rootDir, dir: rootDir,
    });

    expect(result.ok).to.be.true;
    expect(result.filesystemRuns[0]).to.include({ filesUploaded: 2, filesFailed: 0 });
    expect(fileUpload.listenerCount('fileend')).to.equal(0);
  });
});
