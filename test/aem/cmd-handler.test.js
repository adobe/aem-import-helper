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

const ASSET_MAPPING = {
  'https://origin.example.com/image1.jpg': '/content/dam/xwalk/image1.jpg',
};

describe('aemHandler', function () {
  let aemHandler;
  let downloadAssetsStub;
  let prepareModifiedPackageStub;
  let installPackageStub;
  let uploadAssetsStub;
  let exitStub;
  let testDir;
  let outputDir;
  let zipPath;
  let assetMappingPath;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-handler-test-'));
    outputDir = path.join(testDir, 'output');
    fs.mkdirSync(outputDir);
    zipPath = path.join(outputDir, 'package.zip');
    fs.writeFileSync(zipPath, 'zip');
    assetMappingPath = path.join(testDir, 'asset-mapping.json');
    fs.writeFileSync(assetMappingPath, JSON.stringify(ASSET_MAPPING));

    downloadAssetsStub = sinon.stub().callsFake(async (mapping, downloadFolder) => {
      fs.mkdirSync(path.join(downloadFolder, 'xwalk'), { recursive: true });
      fs.writeFileSync(path.join(downloadFolder, 'xwalk', 'image1.jpg'), 'image');
      return [];
    });
    // The package must still be readable once the assets have been uploaded.
    prepareModifiedPackageStub = sinon.stub().callsFake(async (zip) => {
      fs.readFileSync(zip);
      return { modifiedZipPath: zip };
    });
    installPackageStub = sinon.stub().resolves({});
    uploadAssetsStub = sinon.stub().resolves({ uploadResult: { ok: true, errors: [] }, renamedFiles: new Map() });
    exitStub = sinon.stub(process, 'exit');
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    ({ aemHandler } = await esmock('../../src/aem/cmd-handler.js', {
      '../../src/utils/download-assets.js': { downloadAssets: downloadAssetsStub },
      '../../src/aem/upload-assets.js': { uploadAssets: uploadAssetsStub },
      '../../src/aem/upload-summary.js': { printUploadSummary: sinon.stub() },
      '../../src/aem/package-modifier.js': {
        prepareModifiedPackage: prepareModifiedPackageStub,
        buildDetectedExtensionReplacementMap: sinon.stub().returns(new Map()),
      },
      '../../src/aem/package-helper.js': { installPackage: installPackageStub },
      'node-fetch': {
        default: sinon.stub().resolves({ ok: true, status: 200, text: async () => '' }),
      },
    }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function args(overrides = {}) {
    return {
      zip: zipPath,
      'asset-mapping': assetMappingPath,
      token: 'token',
      target: 'https://author.example.com',
      output: outputDir,
      'skip-assets': false,
      keep: false,
      'images-to-png': true,
      ...overrides,
    };
  }

  it('keeps the package inside --output and only deletes downloaded assets', async () => {
    await aemHandler(args());

    expect(prepareModifiedPackageStub.calledOnce).to.be.true;
    expect(installPackageStub.calledOnceWith('https://author.example.com', 'token', zipPath)).to.be.true;
    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(path.join(outputDir, 'xwalk'))).to.be.false;
    expect(fs.existsSync(zipPath)).to.be.true;
  });

  it('deletes downloaded assets only after the package is installed', async () => {
    installPackageStub.callsFake(async () => {
      expect(fs.existsSync(path.join(outputDir, 'xwalk', 'image1.jpg'))).to.be.true;
      return {};
    });

    await aemHandler(args());

    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(path.join(outputDir, 'xwalk'))).to.be.false;
  });

  it('deletes downloaded assets when the package install fails', async () => {
    installPackageStub.rejects(new Error('install failed'));

    await aemHandler(args());

    expect(exitStub.firstCall.args[0]).to.equal(1);
    expect(fs.existsSync(path.join(outputDir, 'xwalk'))).to.be.false;
    expect(fs.existsSync(zipPath)).to.be.true;
  });

  it('deletes the output folder when it was created by the command', async () => {
    const createdOutput = path.join(testDir, 'created-output');

    await aemHandler(args({ output: createdOutput }));

    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(createdOutput)).to.be.false;
  });

  it('keeps downloaded assets with --keep', async () => {
    await aemHandler(args({ keep: true }));

    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(path.join(outputDir, 'xwalk', 'image1.jpg'))).to.be.true;
  });

  it('installs the package but keeps assets and fails when some assets failed to upload', async () => {
    uploadAssetsStub.resolves({
      uploadResult: { ok: false, errors: [{ type: 'filesystem-upload', path: 'xwalk', message: '1 of 1 file(s) failed' }] },
      renamedFiles: new Map(),
    });

    await aemHandler(args());

    expect(installPackageStub.calledOnce).to.be.true;
    expect(exitStub.firstCall.args[0]).to.equal(1);
    expect(fs.existsSync(path.join(outputDir, 'xwalk', 'image1.jpg'))).to.be.true;
    expect(console.error.calledWithMatch(/Content package installed, but some assets failed to upload/)).to.be.true;
  });
});
