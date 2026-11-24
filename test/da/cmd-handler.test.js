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
import esmock from 'esmock';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';

describe('daHandler', function () {
  let daHandler;
  let fetchStub;
  let processPagesStub;
  let exitStub;
  let testDir;
  let daFolder;
  let assetListPath;
  let outputDir;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'da-handler-test-'));
    daFolder = path.join(testDir, 'da-html');
    outputDir = path.join(testDir, 'da-output');
    fs.mkdirSync(daFolder);
    assetListPath = path.join(testDir, 'asset-list.json');
    fs.writeFileSync(
      assetListPath,
      JSON.stringify({
        assets: ['https://origin.example.com/hero.jpg'],
        siteOrigin: 'https://origin.example.com',
      }),
    );

    fetchStub = sinon.stub().resolves({ ok: true, status: 200, statusText: 'OK' });
    processPagesStub = sinon.stub().resolves();
    exitStub = sinon.stub(process, 'exit').callsFake((code) => {
      throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code });
    });
    sinon.stub(console, 'log');
    sinon.stub(console, 'warn');
    sinon.stub(console, 'error');

    ({ daHandler } = await esmock('../../src/da/cmd-handler.js', {
      '../../src/da/da-helper.js': { processPages: processPagesStub },
      'node-fetch': { default: fetchStub },
    }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function args(overrides = {}) {
    return {
      org: 'myorg',
      site: 'mysite',
      'asset-list': assetListPath,
      'da-folder': daFolder,
      output: outputDir,
      keep: false,
      'images-to-png': true,
      ...overrides,
    };
  }

  async function runHandler(handlerArgs) {
    try {
      await daHandler(handlerArgs);
    } catch (err) {
      if (err.exitCode === undefined) {
        throw err;
      }
      return err.exitCode;
    }
    return undefined;
  }

  it('exits 1 when asset-list or da-folder is missing', async () => {
    const missingListCode = await runHandler(args({ 'asset-list': path.join(testDir, 'missing.json') }));
    expect(missingListCode).to.equal(1);
    expect(fetchStub.called).to.be.false;

    const missingFolderCode = await runHandler(args({ 'da-folder': path.join(testDir, 'missing-dir') }));
    expect(missingFolderCode).to.equal(1);
    expect(fetchStub.called).to.be.false;
  });

  it('exits 1 when --local-assets points to a non-existent path', async () => {
    const code = await runHandler(args({ 'local-assets': path.join(testDir, 'no-such-dir') }));
    expect(code).to.equal(1);
    expect(fetchStub.called).to.be.false;
  });

  it('exits 1 and reports authentication required on 401/403 without a token', async () => {
    fetchStub.resolves({ ok: false, status: 401, statusText: 'Unauthorized' });

    const code = await runHandler(args());

    expect(code).to.equal(1);
    expect(processPagesStub.called).to.be.false;
    expect(console.error.calledWithMatch(/requires authentication/i)).to.be.true;
  });

  it('exits 1 and reports invalid token on 401/403 when a token is provided', async () => {
    fetchStub.resolves({ ok: false, status: 403, statusText: 'Forbidden' });

    const code = await runHandler(args({ token: 'bad-token' }));

    expect(code).to.equal(1);
    expect(processPagesStub.called).to.be.false;
    expect(console.error.calledWithMatch(/Invalid token/i)).to.be.true;
    expect(fetchStub.firstCall.args[1].headers).to.deep.equal({ Authorization: 'Bearer bad-token' });
  });

  it('reads token from a file, parses asset-list.json, invokes processPages and exits 0', async () => {
    const tokenFile = path.join(testDir, 'token.txt');
    fs.writeFileSync(tokenFile, '  ims-token-from-file\n');
    const localAssetsDir = path.join(testDir, 'local-assets');
    fs.mkdirSync(localAssetsDir);

    const code = await runHandler(args({
      token: tokenFile,
      keep: true,
      'images-to-png': false,
      'local-assets': localAssetsDir,
    }));

    expect(code).to.equal(0);
    expect(exitStub.calledOnceWith(0)).to.be.true;
    expect(fetchStub.firstCall.args[0]).to.equal('https://admin.da.live/list/myorg/mysite');
    expect(fetchStub.firstCall.args[1]).to.deep.equal({
      method: 'HEAD',
      headers: { Authorization: 'Bearer ims-token-from-file' },
    });
    expect(processPagesStub.calledOnce).to.be.true;
    const callArgs = processPagesStub.firstCall.args;
    expect(callArgs[0]).to.equal('myorg');
    expect(callArgs[1]).to.equal('mysite');
    expect([...callArgs[2]]).to.deep.equal(['https://origin.example.com/hero.jpg']);
    expect(callArgs[3]).to.equal('https://origin.example.com');
    expect(callArgs[4]).to.equal(daFolder);
    expect(callArgs[5]).to.equal(outputDir);
    expect(callArgs[6]).to.equal('ims-token-from-file');
    expect(callArgs[7]).to.equal(true);
    expect(callArgs[8]).to.deep.equal({ imagesToPng: false, localAssetsPath: localAssetsDir });
  });

  it('exits 1 when processPages throws', async () => {
    processPagesStub.rejects(new Error('upload failed'));

    const code = await runHandler(args({ token: 'valid-token' }));

    expect(code).to.equal(1);
    expect(console.error.calledWithMatch(/Error during processing/)).to.be.true;
  });
});
