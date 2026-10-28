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

/**
 * MAX_RETRIES is read at module load, so load a fresh module instance for the given value.
 */
async function loadInstallPackage(maxRetries, mocks = {}) {
  const original = process.env.MAX_RETRIES;
  process.env.MAX_RETRIES = maxRetries;
  try {
    return (await esmock('../../src/aem/package-helper.js', mocks)).installPackage;
  } finally {
    if (original === undefined) {
      delete process.env.MAX_RETRIES;
    } else {
      process.env.MAX_RETRIES = original;
    }
  }
}

describe('installPackage', function () {
  let installPackage;
  let packagePath;
  let tempDir;

  before(async () => {
    // A single attempt: no retry delays.
    installPackage = await loadInstallPackage('1');
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

  it('accepts package manager XML whose Content-Type was rewritten', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, `\n${SUCCESS_XML}`, { 'Content-Type': 'application/octet-stream' });

    await expect(installPackage(TARGET, 'token', packagePath)).to.be.fulfilled;
  });

  it('reports package manager failures whose Content-Type was rewritten', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, FAILURE_XML.replace('<?xml version="1.0" encoding="utf-8"?>\n', ''), { 'Content-Type': 'text/plain' });

    await expect(installPackage(TARGET, 'token', packagePath))
      .to.be.rejectedWith('Failed to install package: Package is invalid');
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
    expect(error.message).to.include('the environment may be hibernated or behind a login page');
    expect(error.message).to.include('status: 200');
    expect(error.message).to.include('content-type: text/html;charset=utf-8');
    expect(error.message).to.include('title: "Environment hibernated"');
    expect(error.message).to.include('<title>Environment hibernated</title>');
    expect(error.message).to.not.include('Unexpected close tag');
    expect(error.retryable).to.be.false;
  });

  it('truncates the body included in the error message', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(200, `<html>${'x'.repeat(1000)}</html>`, { 'Content-Type': 'text/html' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);
    const body = error.message.match(/body: "(.*)"\)$/)[1];

    expect(body.length).to.be.below(500);
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
    expect(error.retryable).to.be.false;
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

  it('reports 401 and 403 responses as authorization failures', async () => {
    nock(TARGET)
      .post(ENDPOINT)
      .reply(403, 'Forbidden', { 'Content-Type': 'text/plain' });

    const error = await installPackage(TARGET, 'token', packagePath).catch((e) => e);

    expect(error.message).to.include('not authorized, check the token');
    expect(error.retryable).to.be.false;
  });

  it('reports errors reading the response body', async () => {
    const fetchStub = sinon.stub().resolves({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers({ 'content-type': 'text/xml' }),
      text: async () => {
        throw new Error('socket hang up');
      },
    });
    const installWithFetch = await loadInstallPackage('1', { 'node-fetch': { default: fetchStub } });

    await expect(installWithFetch(TARGET, 'token', packagePath))
      .to.be.rejectedWith('failed to read response body: socket hang up');
  });

  describe('retries', () => {
    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });
    });

    /**
     * Run installPackage, advancing the fake clock through the retry delays.
     */
    async function runWithRetries(install) {
      let settled = false;
      const promise = install(TARGET, 'token', packagePath).finally(() => {
        settled = true;
      });
      promise.catch(() => {});
      while (!settled) {
        await clock.tickAsync(5000);
      }
      return promise;
    }

    it('retries a failed attempt and resolves on success', async () => {
      const install = await loadInstallPackage('2');
      const bodies = [];
      const scope = nock(TARGET)
        .post(ENDPOINT, (body) => bodies.push(body))
        .reply(503, 'Service Unavailable', { 'Content-Type': 'text/plain' })
        .post(ENDPOINT, (body) => bodies.push(body))
        .reply(200, SUCCESS_XML, { 'Content-Type': 'text/xml' });

      const response = await runWithRetries(install);

      expect(response.status).to.equal(200);
      expect(scope.isDone()).to.be.true;
      // The form data is rebuilt for each attempt.
      expect(bodies).to.have.lengthOf(2);
      expect(bodies[1]).to.include('zip-content');
    });

    it('rejects with the last error once all attempts failed', async () => {
      const install = await loadInstallPackage('2');
      const scope = nock(TARGET)
        .post(ENDPOINT)
        .reply(503, 'first', { 'Content-Type': 'text/plain' })
        .post(ENDPOINT)
        .reply(502, 'second', { 'Content-Type': 'text/plain' });

      const error = await runWithRetries(install).catch((e) => e);

      expect(error.message).to.include('status: 502');
      expect(scope.isDone()).to.be.true;
    });

    it('does not retry a hibernated environment', async () => {
      const install = await loadInstallPackage('3');
      const scope = nock(TARGET)
        .post(ENDPOINT)
        .reply(200, HIBERNATION_HTML, { 'Content-Type': 'text/html' });

      const error = await runWithRetries(install).catch((e) => e);

      expect(error.message).to.include('may be hibernated');
      expect(scope.isDone()).to.be.true;
      expect(console.warn.called).to.be.false;
    });

    ['0', '-1'].forEach((maxRetries) => {
      it(`makes one attempt when MAX_RETRIES is ${maxRetries}`, async () => {
        const install = await loadInstallPackage(maxRetries);
        const scope = nock(TARGET)
          .post(ENDPOINT)
          .reply(503, 'Service Unavailable', { 'Content-Type': 'text/plain' });

        const error = await runWithRetries(install).catch((e) => e);

        expect(error.message).to.include('status: 503');
        expect(scope.isDone()).to.be.true;
      });
    });
  });
});
