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
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { FileSystemUpload, FileSystemUploadOptions } from '@adobe/aem-upload';
import uploadImagesToAEM from '../../src/aem/uploadImages.js';

describe('uploadImages.js', function() {
  this.timeout(30000); // Increase timeout to 30 seconds

  let readFileSyncStub, rmStub, fileUploadStub, createWriteStreamStub, consoleErrorStub;

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    rmStub = sinon.stub(fs.promises, 'rm');
    global.fetchStub = sinon.stub(global, 'fetch');
    fileUploadStub = sinon.stub(FileSystemUpload.prototype, 'upload');
    consoleErrorStub = sinon.stub(console, 'error');
    createWriteStreamStub = sinon.stub(fs, 'createWriteStream');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('uploadImagesToAEM', () => {
    it('should upload images to AEM', async () => {
      const mapFileContent = '{"http://example.com/test/image1.jpg":"/content/dam/test/image1.jpg"}';
      readFileSyncStub.returns(mapFileContent);
      fileUploadStub.resolves({});
      const mockResponse = { ok: true, body: { pipe: sinon.stub() } };
      global.fetchStub.resolves(mockResponse);
      createWriteStreamStub.returns({ on: sinon.stub().callsArg(1) });

      const opts = {
        targetAEMUrl: 'http://aem-instance',
        username: 'admin',
        password: 'admin',
        imageMappingFilePath: 'path/to/image-mapping.json',
      };

      const result = await uploadImagesToAEM(opts);

      expect(fileUploadStub.calledWith(sinon.match.instanceOf(FileSystemUploadOptions), [path.join(process.cwd(), 'test')])).to.equal(true);
      expect(rmStub.calledWith(path.join(process.cwd(), 'test'), { recursive: true, force: true })).to.equal(true);
      expect(result).to.deep.equal({});
    });

    it('should throw an error if no valid AEM asset path is found', async () => {
      readFileSyncStub.returns('{}');

      const opts = {
        targetAEMUrl: 'http://aem-instance',
        username: 'admin',
        password: 'admin',
        imageMappingFilePath: 'path/to/image-mapping.json',
      };

      await expect(uploadImagesToAEM(opts)).to.be.rejectedWith('No valid AEM asset path found in the JCR image mapping file.');
    });

    it('should log errors during file upload', async () => {
      const mapFileContent = '{"http://example.com/image1.jpg":"/content/dam/image1.jpg"}';
      readFileSyncStub.returns(mapFileContent);
      fileUploadStub.rejects(new Error('Upload error'));

      const opts = {
        targetAEMUrl: 'http://aem-instance',
        username: 'admin',
        password: 'admin',
        imageMappingFilePath: 'path/to/image-mapping.json',
      };

      await expect(uploadImagesToAEM(opts)).to.be.rejectedWith('Upload error');
      expect(consoleErrorStub.calledWith(sinon.match.string)).to.equal(true);
    });
  });
});
