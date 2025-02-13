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

import fs from 'fs';
import { expect } from 'chai';
import sinon from 'sinon';
import uploadPackageToAEM from '../../src/aem/uploadPackage.js';

describe('uploadPackage.js', function() {
  this.timeout(30000); // Increase timeout to 30 seconds

  let readFileSyncStub, fetchStub, consoleErrorStub, consoleInfoStub;

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    fetchStub = sinon.stub(global, 'fetch');
    consoleErrorStub = sinon.stub(console, 'error');
    consoleInfoStub = sinon.stub(console, 'info');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('uploadPackageToAEM', () => {
    it('should upload and install package to AEM', async () => {
      const mockResponse = { ok: true, json: () => ({ success: true, path: '/etc/packages/my_packages/package.zip' }) };
      readFileSyncStub.returns(Buffer.from('package content'));
      fetchStub.resolves(mockResponse);

      const opts = {
        username: 'admin',
        password: 'admin',
        targetAEMUrl: 'http://aem-instance',
        packagePath: 'path/to/package.zip',
      };

      await uploadPackageToAEM(opts);

      expect(fetchStub).to.have.been.calledTwice;
      expect(consoleInfoStub).to.have.been.calledWith(sinon.match.string);
    });

    it('should retry upload on failure', async () => {
      const mockErrorResponse = { ok: false, status: 500, statusText: 'Internal Server Error' };
      const mockSuccessResponse = { ok: true, json: () => ({ success: true, path: '/etc/packages/my_packages/package.zip' }) };
      readFileSyncStub.returns(Buffer.from('package content'));
      // for package upload call - fail twice, and 3rd attempt succeeds
      fetchStub.onCall(0).resolves(mockErrorResponse);
      fetchStub.onCall(1).resolves(mockErrorResponse);
      fetchStub.onCall(2).resolves(mockSuccessResponse);
      // for package install call - fail once, and 2nd attempt succeeds
      fetchStub.onCall(3).resolves(mockErrorResponse);
      fetchStub.onCall(4).resolves(mockSuccessResponse);

      const opts = {
        username: 'admin',
        password: 'admin',
        targetAEMUrl: 'http://aem-instance',
        packagePath: 'path/to/package.zip',
      };

      await uploadPackageToAEM(opts);

      expect(fetchStub).to.have.been.callCount(5);
      expect(consoleInfoStub).to.have.been.calledWith(sinon.match.string);
    });

    it('should throw an error if upload fails after retries', async () => {
      const mockErrorResponse = { ok: false, status: 500, statusText: 'Internal Server Error' };
      readFileSyncStub.returns(Buffer.from('package content'));
      fetchStub.resolves(mockErrorResponse);

      const opts = {
        username: 'admin',
        password: 'admin',
        targetAEMUrl: 'http://aem-instance',
        packagePath: 'path/to/package.zip',
      };

      await expect(uploadPackageToAEM(opts)).to.be.rejectedWith('Request failed with status 500: Internal Server Error');
      expect(consoleErrorStub).to.have.been.calledWith(sinon.match.string);
    });

    it('should throw an error if required parameters are missing', async () => {
      const opts = {
        username: 'admin',
        password: 'admin',
        targetAEMUrl: 'http://aem-instance',
      };

      await expect(uploadPackageToAEM(opts)).to.be.rejectedWith('Missing required parameters: username, password, targetAEMUrl, or packagePath');
    });
  });
});
