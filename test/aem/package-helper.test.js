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
import nock from 'nock';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';

chai.use(chaiAsPromised);
const { expect } = chai;

const TARGET = 'https://author.example.com';
const ENDPOINT = '/crx/packmgr/service.jsp';

const SUCCESS_XML = `<?xml version="1.0" encoding="utf-8"?>
<crx version="1.0"><response><status code="200">ok</status></response></crx>`;
const FAILURE_XML = `<?xml version="1.0" encoding="utf-8"?>
<crx version="1.0"><response><status code="500">Package is invalid</status></response></crx>`;
const HIBERNATION_HTML = `<!DOCTYPE html>
<html>
  <head><title>Environment hibernated</title></head>
  <body>
    <h1>This environment has been hibernated</h1>
    <p>Please de-hibernate it from the Developer Console.</p>
  </body>
</html>`;

describe('installPackage', function () {
  let installPackage;
  let packagePath;
  let tempDir;
  let originalMaxRetries;

  before(async () => {
    // MAX_RETRIES is read at module load: load a fresh module instance without retry delays.
    originalMaxRetries = process.env.MAX_RETRIES;
    process.env.MAX_RETRIES = '1';
    ({ installPackage } = await esmock('../../src/aem/package-helper.js'));
  });

  after(() => {
    if (originalMaxRetries === undefined) {
      delete process.env.MAX_RETRIES;
    } else {
      process.env.MAX_RETRIES = originalMaxRetries;
    }
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-helper-test-'));
    packagePath = path.join(tempDir, 'package.zip');
    fs.writeFileSync(packagePath, 'zip-content');
    sinon.stub(console, 'error');
    sinon.stub(console, 'info');
    sinon.stub(console, 'warn');
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves when the package manager reports success', async () => {
    const scope = nock(TARGET)
      .post(ENDPOINT)
      .reply(200, SUCCESS_XML, { 'Content-Type': 'text/xml;charset=utf-8' });

    const response = await installPackage(TARGET, 'token', packagePath);

    expect(response.status).to.equal(200);
    expect(scope.isDone()).to.be.true;
  });

  it('accepts application/xml responses', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, SUCCESS_XML, { 'Content-Type': 'application/xml' });

    await expect(installPackage(TARGET, 'token', packagePath)).to.be.fulfilled;
  });

  it('rejects with the package manager status message on failure', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, FAILURE_XML, { 'Content-Type': 'text/xml' });

    await expect(installPackage(TARGET, 'token', packagePath))
      .to.be.rejectedWith('Failed to install package: Package is invalid');
  });

  it('rejects an HTML page returned with a 200 status without parsing it', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, HIBERNATION_HTML, { 'Content-Type': 'text/html;charset=utf-8' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('response is not a package manager XML response');
    expect(error.message).to.include('status: 200');
    expect(error.message).to.include('content-type: text/html;charset=utf-8');
    expect(error.message).to.include('<title>Environment hibernated</title>');
    expect(error.message).to.not.include('Unexpected close tag');
  });

  it('truncates the body included in the error message', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, `<html>${'x'.repeat(1000)}</html>`, { 'Content-Type': 'text/html' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);
    const body = error.message.match(/body: "(.*)"\)$/)[1];

    expect(body).to.have.lengthOf(203);
    expect(body.endsWith('...')).to.be.true;
  });

  it('does not follow redirects', async () => {
    const scope = nock(TARGET)
      .post(ENDPOINT)
      .reply(302, '', { Location: `${TARGET}/libs/granite/core/content/login.html` });
    const loginScope = nock(TARGET)
      .get('/libs/granite/core/content/login.html')
      .reply(200, SUCCESS_XML, { 'Content-Type': 'text/xml' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include(`unexpected redirect to ${TARGET}/libs/granite/core/content/login.html`);
    expect(error.message).to.include('status: 302');
    expect(scope.isDone()).to.be.true;
    expect(loginScope.isDone()).to.be.false;
  });

  it('rejects non-2xx responses with status, content type and body', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(503, 'Service Unavailable', { 'Content-Type': 'text/plain' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);

    expect(error.message).to.include('unexpected status');
    expect(error.message).to.include('status: 503');
    expect(error.message).to.include('content-type: text/plain');
    expect(error.message).to.include('body: "Service Unavailable"');
  });

  it('rejects malformed XML with a descriptive error', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, '<crx><response></crx>', { 'Content-Type': 'text/xml' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);

    expect(error.message).to.include('invalid XML response');
    expect(error.message).to.include('body: "<crx><response></crx>"');
  });
});
