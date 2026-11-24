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
import archiver from 'archiver';
import esmock from 'esmock';
import nock from 'nock';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sinon from 'sinon';
import unzipper from 'unzipper';
import { downloadAssets } from '../../src/utils/download-assets.js';
import { addExtensionsToFiles } from '../../src/utils/mime-utils.js';
import {
  buildDetectedExtensionReplacementMap,
  buildExtensionReplacementMap,
  prepareModifiedPackage,
} from '../../src/aem/package-modifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  describe('with the default output folder', () => {
    let originalCwd;

    beforeEach(() => {
      originalCwd = process.cwd();
      process.chdir(testDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('removes a default output folder left over from an earlier run once it is empty', async () => {
      fs.mkdirSync(path.join(testDir, 'aem-assets', 'xwalk'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'aem-assets', 'xwalk', 'old.jpg'), 'old');

      await aemHandler(args({ output: 'aem-assets' }));

      expect(exitStub.firstCall.args[0]).to.equal(0);
      expect(fs.existsSync(path.join(testDir, 'aem-assets'))).to.be.false;
    });

    it('keeps a default output folder that still contains other files', async () => {
      fs.mkdirSync(path.join(testDir, 'aem-assets'));
      fs.writeFileSync(path.join(testDir, 'aem-assets', 'notes.txt'), 'keep');

      await aemHandler(args({ output: 'aem-assets' }));

      expect(exitStub.firstCall.args[0]).to.equal(0);
      expect(fs.existsSync(path.join(testDir, 'aem-assets', 'xwalk'))).to.be.false;
      expect(fs.existsSync(path.join(testDir, 'aem-assets', 'notes.txt'))).to.be.true;
    });
  });

  it('skips asset upload when all downloads are rejected and no asset folder is created', async () => {
    downloadAssetsStub.callsFake(async () => [
      { status: 'rejected', reason: new Error('Rejected https://origin.example.com/image1.jpg: expected an image') },
    ]);
    const warnStub = sinon.stub(console, 'warn');

    await aemHandler(args());

    expect(uploadAssetsStub.called).to.be.false;
    expect(warnStub.calledWithMatch(/skipping asset upload/i)).to.be.true;
    expect(prepareModifiedPackageStub.calledOnce).to.be.true;
    expect(installPackageStub.calledOnce).to.be.true;
    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(outputDir)).to.be.true;
    expect(fs.existsSync(zipPath)).to.be.true;
  });

  it('cleans up a command-created output folder when all downloads are rejected unless --keep is set', async () => {
    downloadAssetsStub.callsFake(async () => [
      { status: 'rejected', reason: new Error('Rejected https://origin.example.com/image1.jpg: expected an image') },
    ]);
    sinon.stub(console, 'warn');

    const cleanedOutput = path.join(testDir, 'rejected-output');
    await aemHandler(args({ output: cleanedOutput, keep: false }));
    expect(uploadAssetsStub.called).to.be.false;
    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(cleanedOutput)).to.be.false;

    const keptOutput = path.join(testDir, 'rejected-output-kept');
    await aemHandler(args({ output: keptOutput, keep: true }));
    expect(uploadAssetsStub.called).to.be.false;
    expect(exitStub.secondCall.args[0]).to.equal(0);
    expect(fs.existsSync(keptOutput)).to.be.true;
  });

  it('keeps an output folder named by the caller even when it ends up empty', async () => {
    fs.rmSync(zipPath);
    zipPath = path.join(testDir, 'package.zip');
    fs.writeFileSync(zipPath, 'zip');

    await aemHandler(args());

    expect(exitStub.firstCall.args[0]).to.equal(0);
    expect(fs.existsSync(path.join(outputDir, 'xwalk'))).to.be.false;
    expect(fs.existsSync(outputDir)).to.be.true;
  });
});

describe('AEM download -> rename -> package modification pipeline', function () {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-pipeline-test-'));
  });

  afterEach(() => {
    nock.cleanAll();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('converts valid images, renames extensionless assets, removes stale rejected files and rewrites package XML', async () => {
    const downloadDir = path.join(tempRoot, 'downloads');
    const assetRootDir = path.join(downloadDir, 'site');
    const staleBlocked = path.join(assetRootDir, 'blocked.jpg');
    fs.mkdirSync(assetRootDir, { recursive: true });
    fs.writeFileSync(staleBlocked, 'stale WAF body from previous run');

    const scope = nock('https://origin.example.com')
      .get('/hero.webp')
      .replyWithFile(200, path.resolve(__dirname, '../fixtures/images/sample.webp'), { 'Content-Type': 'image/webp' })
      .get('/media/photo')
      .replyWithFile(200, path.resolve(__dirname, '../fixtures/images/sample.jpg'), { 'Content-Type': 'image/jpeg' })
      .get('/blocked.jpg')
      .reply(200, '<!DOCTYPE html><html><body>Access Denied</body></html>', { 'Content-Type': 'text/html' });

    const assetMapping = new Map([
      ['https://origin.example.com/hero.webp', '/content/dam/site/hero.webp'],
      ['https://origin.example.com/media/photo', '/content/dam/site/photo'],
      ['https://origin.example.com/blocked.jpg', '/content/dam/site/blocked.jpg'],
    ]);

    const downloadResults = await downloadAssets(assetMapping, downloadDir, 1, 0, {}, { convertImagesToPng: true });
    expect(downloadResults.map((r) => r.status)).to.deep.equal(['fulfilled', 'fulfilled', 'rejected']);
    expect(fs.existsSync(path.join(assetRootDir, 'hero.png'))).to.be.true;
    expect(fs.existsSync(staleBlocked)).to.be.false;

    const renamedFiles = await addExtensionsToFiles(assetRootDir);
    expect(fs.existsSync(path.join(assetRootDir, 'photo.jpg'))).to.be.true;

    const extensionReplacements = buildDetectedExtensionReplacementMap(assetMapping, assetRootDir);
    for (const [from, to] of buildExtensionReplacementMap(renamedFiles, assetRootDir).entries()) {
      extensionReplacements.set(from, to);
    }

    // Build a minimal content package referencing all three assets
    const pkgSrcDir = path.join(tempRoot, 'pkg-src');
    const xmlDir = path.join(pkgSrcDir, 'jcr_root', 'content', 'site');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(
      path.join(xmlDir, '.content.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<jcr:root hero="/content/dam/site/hero.webp" photo="/content/dam/site/photo" blocked="/content/dam/site/blocked.jpg"/>\n',
    );
    const inputZip = path.join(tempRoot, 'input.zip');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(inputZip);
      const archive = archiver('zip', { zlib: { level: 9 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.directory(pkgSrcDir, false);
      archive.finalize();
    });

    const { modifiedZipPath } = await prepareModifiedPackage(inputZip, assetMapping, true, extensionReplacements);
    const extractedDir = path.join(tempRoot, 'pkg-out');
    const directory = await unzipper.Open.file(modifiedZipPath);
    await directory.extract({ path: extractedDir });

    const updatedXml = fs.readFileSync(path.join(extractedDir, 'jcr_root', 'content', 'site', '.content.xml'), 'utf8');
    expect(updatedXml).to.include('hero="/content/dam/site/hero.png"');
    expect(updatedXml).to.include('photo="/content/dam/site/photo.jpg"');
    expect(updatedXml).to.include('blocked="/content/dam/site/blocked.jpg"');

    await scope.done();
    fs.rmSync(path.dirname(modifiedZipPath), { recursive: true, force: true });
  });
});
