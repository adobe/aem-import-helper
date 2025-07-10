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
import { expect } from 'chai';
import sinon from 'sinon';
import path from 'path';
import { uploadFile, uploadFolder, getAllHtmlFiles } from '../../src/da/upload.js';

describe('upload', function () {
  let mockDependencies;
  let mockFormData;
  let mockFormDataInstance;

  beforeEach(() => {
    sinon.restore();
    
    mockFormDataInstance = {
      append: sinon.stub(),
      getHeaders: sinon.stub().returns({ 'content-type': 'multipart/form-data' }),
    };
    
    mockFormData = function() {
      return mockFormDataInstance;
    };
    
    mockDependencies = {
      fs: {
        existsSync: sinon.stub(),
        createReadStream: sinon.stub(),
        readdirSync: sinon.stub(),
      },
      path: {
        relative: sinon.stub(),
        join: path.join,
        extname: sinon.stub(),
      },
      FormData: mockFormData,
      fetch: sinon.stub(),
      chalk: {
        yellow: sinon.stub().returnsArg(0),
        green: sinon.stub().returnsArg(0),
        blue: sinon.stub().returnsArg(0),
        red: sinon.stub().returnsArg(0),
      },
      getAllHtmlFiles: sinon.stub(),
    };
    
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(console, 'debug');
    sinon.stub(console, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getAllHtmlFiles', function() {
    it('should return all files when no extension filter is provided', function() {
      const files = [
        { isFile: () => true, parentPath: '/fake/dir', name: 'file1.html' },
        { isFile: () => true, parentPath: '/fake/dir/sub', name: 'file2.js' },
        { isFile: () => false, parentPath: '/fake/dir', name: 'folder' },
      ];
      mockDependencies.fs.readdirSync.returns(files);
      const result = getAllHtmlFiles('/fake/dir', {}, mockDependencies);
      expect(result).to.have.length(2);
      expect(result[0]).to.equal('/fake/dir/file1.html');
      expect(result[1]).to.equal('/fake/dir/sub/file2.js');
    });

    it('should filter files by extension', function() {
      const files = [
        { isFile: () => true, parentPath: '/fake/dir', name: 'file1.html' },
        { isFile: () => true, parentPath: '/fake/dir/sub', name: 'file2.js' },
      ];
      mockDependencies.fs.readdirSync.returns(files);
      mockDependencies.path.extname.withArgs('/fake/dir/file1.html').returns('.html');
      mockDependencies.path.extname.withArgs('/fake/dir/sub/file2.js').returns('.js');

      const result = getAllHtmlFiles('/fake/dir', { fileExtensions: ['.html'] }, mockDependencies);
      expect(result).to.have.length(1);
      expect(result[0]).to.equal('/fake/dir/file1.html');
    });

    it('should throw "Folder not found" for non-existent directory', function() {
      const error = new Error('Not found');
      error.code = 'ENOENT';
      mockDependencies.fs.readdirSync.throws(error);
      expect(() => getAllHtmlFiles('/fake/dir', {}, mockDependencies)).to.throw('Folder not found: /fake/dir');
    });
  });

  describe('uploadFile', function () {
    const filePath = '/test/path/file.jpg';
    const uploadUrl = 'https://admin.da.live/source/org/repo';
    const authToken = 'test-token';

    it('should upload a file successfully on the first attempt', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);

      expect(result.success).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(1);
    });

    it('should retry on failure and succeed', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch
        .onFirstCall().resolves({ ok: false, status: 500, statusText: 'Server Error' })
        .onSecondCall().resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFile(filePath, uploadUrl, authToken, { retries: 2, retryDelay: 10 }, mockDependencies);

      expect(result.success).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(2);
      expect(console.warn.calledOnce).to.be.true;
    });

    it('should fail after all retries on non-OK response', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: false, status: 500, statusText: 'Server Error' });

      try {
        await uploadFile(filePath, uploadUrl, authToken, { retries: 2, retryDelay: 10 }, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Upload failed with status: 500');
        expect(mockDependencies.fetch.callCount).to.equal(3);
        expect(console.warn.callCount).to.equal(2);
        expect(console.error.calledOnce).to.be.true;
      }
    });

    it('should fail after all retries on network error', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.rejects(new Error('network error'));

      try {
        await uploadFile(filePath, uploadUrl, authToken, { retries: 2, retryDelay: 10 }, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('network error');
        expect(mockDependencies.fetch.callCount).to.equal(3);
        expect(console.warn.callCount).to.equal(2);
        expect(console.error.calledOnce).to.be.true;
      }
    });

    it('should handle file not found error', async function () {
      mockDependencies.fs.existsSync.returns(false);
      try {
        await uploadFile(filePath, uploadUrl, authToken, { retries: 1, retryDelay: 10 }, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('File not found');
      }
    });

    it('should handle relative path calculation with baseFolder', async function () {
      const baseFolder = '/test/path';
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.path.relative.returns('file.jpg');
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, authToken, { baseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(baseFolder, filePath)).to.be.true;
      const fetchUrl = mockDependencies.fetch.firstCall.args[0];
      expect(fetchUrl).to.equal(`${uploadUrl}/file.jpg`);
    });

    it('should use filePath as relative path if it does not start with baseFolder', async function () {
      const baseFolder = '/another/path';
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, authToken, { baseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.notCalled).to.be.true;
      const fetchUrl = mockDependencies.fetch.firstCall.args[0];
      expect(fetchUrl).to.equal(`${uploadUrl}/${filePath}`);
    });

    it('should add authorization header when token is provided', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);

      expect(mockDependencies.fetch.firstCall.args[1].headers['Authorization']).to.equal(`Bearer ${authToken}`);
    });

    it('should not add authorization header when token is not provided', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, null, {}, mockDependencies);

      expect(mockDependencies.fetch.firstCall.args[1].headers['Authorization']).to.be.undefined;
    });
  });

  describe('uploadFolder', function () {
    const folderPath = '/test/folder';
    const uploadUrl = 'https://admin.da.live/source/org/repo';
    const authToken = 'test-token';

    it('should throw an error if getAllHtmlFiles throws', async function () {
      const testError = new Error('Test Error');
      mockDependencies.getAllHtmlFiles.throws(testError);

      try {
        await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.equal(testError);
      }
    });

    it('should handle empty folder', async function () {
      mockDependencies.getAllHtmlFiles.returns([]);
      const result = await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(0);
    });

    it('should upload all files in a folder successfully', async function () {
      const files = ['/test/folder/file1.html', '/test/folder/file2.html'];
      mockDependencies.getAllHtmlFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(2);
      expect(result.failedFiles).to.equal(0);
      expect(mockDependencies.fetch.callCount).to.equal(2);
    });

    it('should handle a mix of successful and failed uploads', async function () {
      const files = ['/test/folder/file1.html', '/test/folder/file2.html'];
      mockDependencies.getAllHtmlFiles.returns(files);
      
      // First file succeeds, second fails
      mockDependencies.fs.existsSync.withArgs(files[0]).returns(true);
      mockDependencies.fs.existsSync.withArgs(files[1]).returns(false); // This will cause uploadFile to throw

      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, { retries: 1, retryDelay: 10 }, mockDependencies);

      expect(result.success).to.be.false;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(1);
      expect(result.failedFiles).to.equal(1);
      expect(result.results[1].error).to.include('File not found');
    });

    it('should use custom baseFolder when provided', async function () {
      const files = ['/custom/base/folder/file1.html'];
      const customBaseFolder = '/custom/base';
      mockDependencies.getAllHtmlFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });
      mockDependencies.path.relative.returns('folder/file1.html');
      
      await uploadFolder('/custom/base/folder', uploadUrl, authToken, { baseFolder: customBaseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(customBaseFolder, files[0])).to.be.true;
    });

    it('should use folderPath as baseFolder by default', async function () {
      const files = [`${folderPath}/file1.html`];
      mockDependencies.getAllHtmlFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });
      mockDependencies.path.relative.returns('file1.html');
      
      await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(folderPath, files[0])).to.be.true;
    });
  });
}); 