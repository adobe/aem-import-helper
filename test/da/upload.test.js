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
import { uploadFile, uploadFolder, getAllFiles, uploadFilesBatched } from '../../src/da/upload.js';

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
        cyan: sinon.stub().returnsArg(0),
      },
      getAllFiles: sinon.stub(),
    };
    
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(console, 'debug');
    sinon.stub(console, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getAllFiles', function() {
    it('should return all files when no extension filter is provided', function() {
      const files = [
        { isFile: () => true, parentPath: '/fake/dir', name: 'file1.html' },
        { isFile: () => true, parentPath: '/fake/dir/sub', name: 'file2.js' },
        { isFile: () => false, parentPath: '/fake/dir', name: 'folder' },
      ];
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.readdirSync.returns(files);
      const result = getAllFiles('/fake/dir', [], [], mockDependencies);
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

      const result = getAllFiles('/fake/dir', ['.html'], [], mockDependencies);
      expect(result).to.have.length(1);
      expect(result[0]).to.equal('/fake/dir/file1.html');
    });

    it('should exclude files by extension', function() {
      const files = [
        { isFile: () => true, parentPath: '/fake/dir', name: 'file1.html' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file2.js' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file3.docx' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file4.txt' },
      ];
      mockDependencies.fs.readdirSync.returns(files);
      mockDependencies.path.extname.withArgs('/fake/dir/file1.html').returns('.html');
      mockDependencies.path.extname.withArgs('/fake/dir/file2.js').returns('.js');
      mockDependencies.path.extname.withArgs('/fake/dir/file3.docx').returns('.docx');
      mockDependencies.path.extname.withArgs('/fake/dir/file4.txt').returns('.txt');

      const result = getAllFiles('/fake/dir', [], ['.docx', '.txt'], mockDependencies);
      expect(result).to.have.length(2);
      expect(result).to.include('/fake/dir/file1.html');
      expect(result).to.include('/fake/dir/file2.js');
    });

    it('should handle both include and exclude filters', function() {
      const files = [
        { isFile: () => true, parentPath: '/fake/dir', name: 'file1.html' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file2.js' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file3.docx' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file4.txt' },
        { isFile: () => true, parentPath: '/fake/dir', name: 'file5.html' },
      ];
      mockDependencies.fs.readdirSync.returns(files);
      mockDependencies.path.extname.withArgs('/fake/dir/file1.html').returns('.html');
      mockDependencies.path.extname.withArgs('/fake/dir/file2.js').returns('.js');
      mockDependencies.path.extname.withArgs('/fake/dir/file3.docx').returns('.docx');
      mockDependencies.path.extname.withArgs('/fake/dir/file4.txt').returns('.txt');
      mockDependencies.path.extname.withArgs('/fake/dir/file5.html').returns('.html');

      const result = getAllFiles('/fake/dir', ['.html', '.js'], ['.js'], mockDependencies);
      expect(result).to.have.length(2);
      expect(result).to.include('/fake/dir/file1.html');
      expect(result).to.include('/fake/dir/file5.html');
    });

    it('should throw "Folder not found" for non-existent directory', function() {
      const error = new Error('Not found');
      error.code = 'ENOENT';
      mockDependencies.fs.readdirSync.throws(error);
      expect(() => getAllFiles('/fake/dir', [], mockDependencies)).to.throw('Folder not found: /fake/dir');
    });
  });

  describe('uploadFile', function () {
    const filePath = '/test/path/file.jpg';
    const uploadUrl = 'https://admin.da.live/source/org/repo';
    const token = 'test-token';

    it('should upload a file successfully on the first attempt', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFile(filePath, uploadUrl, token, {}, mockDependencies);

      expect(result.success).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(1);
    });

    it('should retry on failure and succeed', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch
        .onFirstCall().resolves({ ok: false, status: 500, statusText: 'Server Error' })
        .onSecondCall().resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFile(filePath, uploadUrl, token, { retries: 2, retryDelay: 10 }, mockDependencies);

      expect(result.success).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(2);
      expect(console.warn.calledOnce).to.be.true;
    });

    it('should fail after all retries on non-OK response', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: false, status: 500, statusText: 'Server Error' });

      try {
        await uploadFile(filePath, uploadUrl, token, { retries: 2, retryDelay: 10 }, mockDependencies);
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
        await uploadFile(filePath, uploadUrl, token, { retries: 2, retryDelay: 10 }, mockDependencies);
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
        await uploadFile(filePath, uploadUrl, token, { retries: 1, retryDelay: 10 }, mockDependencies);
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

      await uploadFile(filePath, uploadUrl, token, { baseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(baseFolder, filePath)).to.be.true;
      const fetchUrl = mockDependencies.fetch.firstCall.args[0];
      expect(fetchUrl).to.equal(`${uploadUrl}/file.jpg`);
    });

    it('should use filePath as relative path if it does not start with baseFolder', async function () {
      const baseFolder = '/another/path';
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, token, { baseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.notCalled).to.be.true;
      const fetchUrl = mockDependencies.fetch.firstCall.args[0];
      expect(fetchUrl).to.equal(`${uploadUrl}/${filePath}`);
    });

    it('should add authorization header when token is provided', async function () {
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      await uploadFile(filePath, uploadUrl, token, {}, mockDependencies);

      expect(mockDependencies.fetch.firstCall.args[1].headers['Authorization']).to.equal(`Bearer ${token}`);
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
    const token = 'test-token';

    it('should throw an error if getAllFiles throws', async function () {
      const testError = new Error('Test Error');
      mockDependencies.getAllFiles.throws(testError);

      try {
        await uploadFolder(folderPath, uploadUrl, token, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.equal(testError);
      }
    });

    it('should handle empty folder', async function () {
      mockDependencies.getAllFiles.returns([]);
      const result = await uploadFolder(folderPath, uploadUrl, token, {}, mockDependencies);
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(0);
    });

    it('should upload all files in a folder successfully', async function () {
      const files = ['/test/folder/file1.html', '/test/folder/file2.html'];
      mockDependencies.getAllFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFolder(folderPath, uploadUrl, token, {}, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(2);
      expect(result.failedFiles).to.equal(0);
      expect(mockDependencies.fetch.callCount).to.equal(2);
    });

    it('should handle a mix of successful and failed uploads', async function () {
      const files = ['/test/folder/file1.html', '/test/folder/file2.html'];
      mockDependencies.getAllFiles.returns(files);
      
      // First file succeeds, second fails
      mockDependencies.fs.existsSync.withArgs(files[0]).returns(true);
      mockDependencies.fs.existsSync.withArgs(files[1]).returns(false); // This will cause uploadFile to throw

      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });

      const result = await uploadFolder(folderPath, uploadUrl, token, { retries: 1, retryDelay: 10 }, mockDependencies);

      expect(result.success).to.be.false;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(1);
      expect(result.failedFiles).to.equal(1);
      expect(result.results[1].error).to.include('File not found');
    });

    it('should use custom baseFolder when provided', async function () {
      const files = ['/custom/base/folder/file1.html'];
      const customBaseFolder = '/custom/base';
      mockDependencies.getAllFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });
      mockDependencies.path.relative.returns('folder/file1.html');
      
      await uploadFolder('/custom/base/folder', uploadUrl, token, { baseFolder: customBaseFolder }, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(customBaseFolder, files[0])).to.be.true;
    });

    it('should use folderPath as baseFolder by default', async function () {
      const files = [`${folderPath}/file1.html`];
      mockDependencies.getAllFiles.returns(files);
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });
      mockDependencies.path.relative.returns('file1.html');
      
      await uploadFolder(folderPath, uploadUrl, token, {}, mockDependencies);

      expect(mockDependencies.path.relative.calledWith(folderPath, files[0])).to.be.true;
    });
  });

  describe('uploadFilesBatched', function () {
    const uploadUrl = 'https://admin.da.live/source/org/repo';
    const token = 'test-token';

    beforeEach(() => {
      // Mock the uploadFile function for these tests
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fetch.resolves({ ok: true, status: 200, text: async () => 'success' });
    });

    it('should handle empty file array', async function () {
      const result = await uploadFilesBatched([], uploadUrl, token, {}, mockDependencies);
      
      expect(result).to.be.an('array').that.is.empty;
      expect(mockDependencies.fetch.callCount).to.equal(0);
    });

    it('should upload small number of files without batching', async function () {
      const files = ['/test/file1.html', '/test/file2.html', '/test/file3.html'];
       
      const result = await uploadFilesBatched(files, uploadUrl, token, {}, mockDependencies);
       
      expect(result).to.have.length(3);
      expect(result.every(r => r.success)).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(3);
       
      // Verify that console.log was called for batch processing
      expect(console.log.called).to.be.true;
    });

    it('should batch files when exceeding MAX_CONCURRENT_UPLOADS (50)', async function () {
      // Create array of 75 files to test batching
      const files = Array.from({ length: 75 }, (_, i) => `/test/file${i}.html`);
      
      const result = await uploadFilesBatched(files, uploadUrl, token, {}, mockDependencies);
      
      expect(result).to.have.length(75);
      expect(result.every(r => r.success)).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(75);
      
      // Verify that logging occurred for batches
      expect(console.log.called).to.be.true;
    });

    it('should handle mixed success and failure results', async function () {
      const files = ['/test/file1.html', '/test/file2.html', '/test/file3.html'];
      
      // Make the second file fail
      mockDependencies.fetch
        .onCall(0).resolves({ ok: true, status: 200, text: async () => 'success' })
        .onCall(1).resolves({ ok: false, status: 500, statusText: 'Server Error' })
        .onCall(2).resolves({ ok: true, status: 200, text: async () => 'success' });
      
      const result = await uploadFilesBatched(files, uploadUrl, token, { retries: 0, retryDelay: 1 }, mockDependencies);
      
      expect(result).to.have.length(3);
      expect(result[0].success).to.be.true;
      expect(result[1].success).to.be.false;
      expect(result[1].error).to.include('Upload failed with status: 500');
      expect(result[2].success).to.be.true;
             
      // Verify that logging occurred
      expect(console.log.called).to.be.true;
    });

    it('should handle network errors gracefully', async function () {
      const files = ['/test/file1.html', '/test/file2.html'];
      
      // First file succeeds, second throws network error
      mockDependencies.fetch
        .onCall(0).resolves({ ok: true, status: 200, text: async () => 'success' })
        .onCall(1).rejects(new Error('Network timeout'));
      
      const result = await uploadFilesBatched(files, uploadUrl, token, { retries: 0, retryDelay: 1 }, mockDependencies);
      
      expect(result).to.have.length(2);
      expect(result[0].success).to.be.true;
      expect(result[1].success).to.be.false;
      expect(result[1].error).to.equal('Network timeout');
    });

    it('should pass options through to uploadFile', async function () {
      const files = ['/test/file1.html'];
      const customOptions = {
        userAgent: 'custom-agent',
        baseFolder: '/custom/base',
        retries: 5,
        retryDelay: 2000,
      };
      
      await uploadFilesBatched(files, uploadUrl, token, customOptions, mockDependencies);
      
      // Verify that uploadFile was called with the custom options
      expect(mockDependencies.fetch.callCount).to.equal(1);
      
      // Check that the User-Agent header was set correctly
      const fetchCall = mockDependencies.fetch.firstCall;
      const headers = fetchCall.args[1].headers;
      expect(headers['User-Agent']).to.equal('custom-agent');
    });

    it('should handle exactly 50 files (boundary condition)', async function () {
      const files = Array.from({ length: 50 }, (_, i) => `/test/file${i}.html`);
      
      const result = await uploadFilesBatched(files, uploadUrl, token, {}, mockDependencies);
      
      expect(result).to.have.length(50);
      expect(result.every(r => r.success)).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(50);
      
      // Verify that logging occurred
      expect(console.log.called).to.be.true;
    });

    it('should handle exactly 51 files (boundary condition)', async function () {
      const files = Array.from({ length: 51 }, (_, i) => `/test/file${i}.html`);
      
      const result = await uploadFilesBatched(files, uploadUrl, token, {}, mockDependencies);
      
      expect(result).to.have.length(51);
      expect(result.every(r => r.success)).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(51);
      
      // Verify that logging occurred for multiple batches
      expect(console.log.called).to.be.true;
    });

    it('should handle single file', async function () {
      const files = ['/test/single-file.html'];
       
      const result = await uploadFilesBatched(files, uploadUrl, token, {}, mockDependencies);
       
      expect(result).to.have.length(1);
      expect(result[0].success).to.be.true;
      expect(mockDependencies.fetch.callCount).to.equal(1);
       
      // Verify that logging occurred
      expect(console.log.called).to.be.true;
    });

    it('should include file paths in error results', async function () {
      const files = ['/test/file1.html', '/test/file2.html'];
      
      // Make both files fail with different errors
      mockDependencies.fetch
        .onCall(0).rejects(new Error('First error'))
        .onCall(1).rejects(new Error('Second error'));
      
      const result = await uploadFilesBatched(files, uploadUrl, token, { retries: 0, retryDelay: 1 }, mockDependencies);
      
      expect(result).to.have.length(2);
      expect(result[0].success).to.be.false;
      expect(result[0].error).to.equal('First error');
      expect(result[0].filePath).to.equal('/test/file1.html');
      
      expect(result[1].success).to.be.false;
      expect(result[1].error).to.equal('Second error');
      expect(result[1].filePath).to.equal('/test/file2.html');
    });
  });
}); 