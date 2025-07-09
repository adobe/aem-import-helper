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
import { uploadFile, uploadFiles, uploadFolder } from '../../src/da/upload.js';

describe('upload', function () {
  let mockDependencies;
  let mockFormData;
  let mockFormDataInstance;

  beforeEach(() => {
    // Clear any existing stubs
    sinon.restore();
    
    // Create mock FormData
    mockFormDataInstance = {
      append: sinon.stub(),
      getHeaders: sinon.stub().returns({ 'content-type': 'multipart/form-data' }),
    };
    
    mockFormData = function() {
      return mockFormDataInstance;
    };
    
    // Create mock dependencies
    mockDependencies = {
      fs: {
        existsSync: sinon.stub(),
        createReadStream: sinon.stub(),
        statSync: sinon.stub(),
      },
      path: {
        relative: sinon.stub(),
      },
      FormData: mockFormData,
      fetch: sinon.stub(),
      chalk: {
        yellow: sinon.stub().returns('yellow'),
        green: sinon.stub().returns('green'),
        blue: sinon.stub().returns('blue'),
        red: sinon.stub().returns('red'),
      },
      getAllFiles: sinon.stub(),
    };
    
    // Stub console methods
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(console, 'debug');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('uploadFile', function () {
    it('should handle file not found error', async function () {
      const filePath = '/test/path/nonexistent.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file does not exist
      mockDependencies.fs.existsSync.returns(false);

      try {
        await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('File not found');
      }
    });

    it('should handle relative path calculation with baseFolder', async function () {
      const filePath = '/base/folder/sub/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { baseFolder: '/base/folder' };
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock path operations
      mockDependencies.path.relative.returns('sub/file.jpg');
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFile(filePath, uploadUrl, authToken, options, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.filePath).to.equal(filePath);
      expect(result.relativePath).to.equal('sub/file.jpg');
      expect(mockDependencies.path.relative.calledOnce).to.be.true;
      expect(mockDependencies.path.relative.firstCall.args[0]).to.equal('/base/folder');
      expect(mockDependencies.path.relative.firstCall.args[1]).to.equal('/base/folder/sub/file.jpg');
    });

    it('should handle relative path calculation without baseFolder', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.filePath).to.equal(filePath);
      expect(result.relativePath).to.equal(filePath);
    });

    it('should handle custom user agent option', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { userAgent: 'custom-agent/1.0' };
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFile(filePath, uploadUrl, authToken, options, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.filePath).to.equal(filePath);
    });

    it('should handle file path that does not start with baseFolder', async function () {
      const filePath = '/different/path/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { baseFolder: '/base/folder' };
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFile(filePath, uploadUrl, authToken, options, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.filePath).to.equal(filePath);
      expect(result.relativePath).to.equal(filePath);
    });

    it('should handle FormData creation and headers', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(mockFormDataInstance.append.calledOnce).to.be.true;
      expect(mockFormDataInstance.append.firstCall.args[0]).to.equal('data');
      expect(mockFormDataInstance.getHeaders.calledOnce).to.be.true;
    });

    it('should handle upload failure with non-ok response', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch to return error
      mockDependencies.fetch.resolves({ 
        ok: false, 
        status: 401, 
        statusText: 'Unauthorized', 
        text: async () => 'fail', 
      });

      try {
        await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Upload failed with status: 401');
      }
    });

    it('should throw if fetch throws', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch to throw
      mockDependencies.fetch.rejects(new Error('network error'));
      
      try {
        await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.include('network error');
      }
    });

    it('should handle authorization header when token is provided', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
      
      // Verify fetch was called with authorization header
      expect(mockDependencies.fetch.calledOnce).to.be.true;
      const fetchCall = mockDependencies.fetch.firstCall;
      expect(fetchCall.args[1].headers['Authorization']).to.equal('Bearer test-token');
    });

    it('should not add authorization header when token is not provided', async function () {
      const filePath = '/test/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = null;
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      await uploadFile(filePath, uploadUrl, authToken, {}, mockDependencies);
      
      // Verify fetch was called without authorization header
      expect(mockDependencies.fetch.calledOnce).to.be.true;
      const fetchCall = mockDependencies.fetch.firstCall;
      expect(fetchCall.args[1].headers['Authorization']).to.be.undefined;
    });
  });

  describe('uploadFiles', function () {
    it('should handle empty file paths array', async function () {
      const filePaths = [];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';

      const results = await uploadFiles(filePaths, uploadUrl, authToken, {}, mockDependencies);

      expect(results).to.deep.equal([]);
    });

    it('should handle single file upload success', async function () {
      const filePaths = ['/test/file1.jpg'];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const results = await uploadFiles(filePaths, uploadUrl, authToken, {}, mockDependencies);
      
      expect(results).to.have.length(1);
      expect(results[0].success).to.be.true;
      expect(results[0].status).to.equal(200);
    });

    it('should handle multiple files with mixed existence', async function () {
      const filePaths = ['/test/file1.jpg', '/test/file2.png'];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file existence for first file, not for second
      mockDependencies.fs.existsSync.withArgs('/test/file1.jpg').returns(true);
      mockDependencies.fs.existsSync.withArgs('/test/file2.png').returns(false);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const results = await uploadFiles(filePaths, uploadUrl, authToken, {}, mockDependencies);
      
      expect(results).to.have.length(2);
      expect(results[0].success).to.be.true;
      expect(results[1].success).to.be.false;
      expect(results[1].error).to.include('File not found');
    });

    it('should handle all files failing', async function () {
      const filePaths = ['/test/file1.jpg', '/test/file2.png'];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock all files don't exist
      mockDependencies.fs.existsSync.returns(false);
      
      const results = await uploadFiles(filePaths, uploadUrl, authToken, {}, mockDependencies);
      
      expect(results).to.have.length(2);
      expect(results[0].success).to.be.false;
      expect(results[1].success).to.be.false;
    });

    it('should handle mixed success and failure results', async function () {
      const filePaths = ['/test/file1.jpg', '/test/file2.png'];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file existence for first file, not for second
      mockDependencies.fs.existsSync.withArgs('/test/file1.jpg').returns(true);
      mockDependencies.fs.existsSync.withArgs('/test/file2.png').returns(false);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const results = await uploadFiles(filePaths, uploadUrl, authToken, {}, mockDependencies);

      expect(results).to.have.length(2);
      expect(results[0].success).to.be.true;
      expect(results[1].success).to.be.false;
      expect(results[1].error).to.include('File not found');
    });
  });

  describe('uploadFolder', function () {
    it('should handle folder not found error', async function () {
      const folderPath = '/test/nonexistent';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock folder does not exist
      mockDependencies.fs.existsSync.returns(false);

      try {
        await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Folder not found');
      }
    });

    it('should handle path is not a directory error', async function () {
      const folderPath = '/test/file.txt';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock path exists but is not a directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => false });

      try {
        await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Path is not a directory');
      }
    });

    it('should handle empty folder with no files', async function () {
      const folderPath = '/test/empty';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return empty array
      mockDependencies.getAllFiles.returns([]);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);

      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(0);
      expect(result.uploadedFiles).to.equal(0);
      expect(result.failedFiles).to.equal(0);
      expect(result.results).to.deep.equal([]);
    });

    it('should handle folder with files but no matching extensions', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { fileExtensions: ['.html', '.htm'] };
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return empty array (no matching extensions)
      mockDependencies.getAllFiles.returns([]);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);

      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(0);
      expect(result.uploadedFiles).to.equal(0);
      expect(result.failedFiles).to.equal(0);
      expect(result.results).to.deep.equal([]);
    });

    it('should handle folder with files and exclude patterns', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { 
        excludePatterns: ['node_modules', '.git'],
        fileExtensions: ['.html', '.htm'],
      };
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return some files
      mockDependencies.getAllFiles.returns([
        '/test/folder/file1.html',
        '/test/folder/node_modules/file2.html',
        '/test/folder/.git/file3.html',
        '/test/folder/file4.html',
      ]);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);
      
      expect(mockDependencies.getAllFiles.calledOnce).to.be.true;
      expect(mockDependencies.getAllFiles.firstCall.args[0]).to.equal(folderPath);
      expect(mockDependencies.getAllFiles.firstCall.args[1]).to.deep.equal(['.html', '.htm']);
      expect(result.totalFiles).to.equal(2);
    });

    it('should handle verbose option', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { verbose: true };
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return some files
      mockDependencies.getAllFiles.returns(['/test/folder/file1.html', '/test/folder/file2.html']);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);
      
      expect(mockDependencies.getAllFiles.calledOnce).to.be.true;
      expect(result.totalFiles).to.equal(2);
    });

    it('should handle custom file extensions option', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { fileExtensions: ['.css', '.js'] };
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return empty array
      mockDependencies.getAllFiles.returns([]);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);

      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(0);
      expect(mockDependencies.getAllFiles.calledOnce).to.be.true;
      expect(mockDependencies.getAllFiles.firstCall.args[1]).to.deep.equal(['.css', '.js']);
    });

    it('should handle folder upload with baseFolder option', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { baseFolder: '/test' };
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return some files
      mockDependencies.getAllFiles.returns(['/test/folder/file1.html']);

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);
      
      expect(mockDependencies.getAllFiles.calledOnce).to.be.true;
      expect(result.totalFiles).to.equal(1);
    });

    it('should throw if folder exists but statSync throws', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock folder exists but statSync throws
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.throws(new Error('stat error'));
      
      try {
        await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.include('stat error');
      }
    });

    it('should handle successful folder upload with summary', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return some files
      mockDependencies.getAllFiles.returns(['/test/folder/file1.html', '/test/folder/file2.html']);
      
      // Mock file uploads to succeed
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(2);
      expect(result.failedFiles).to.equal(0);
      expect(result.results).to.have.length(2);
    });

    it('should handle folder upload with some failures', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock folder exists and is directory
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      
      // Mock getAllFiles to return some files
      mockDependencies.getAllFiles.returns(['/test/folder/file1.html', '/test/folder/file2.html']);
      
      // Mock first file to succeed, second to fail
      mockDependencies.fs.existsSync.withArgs('/test/folder/file1.html').returns(true);
      mockDependencies.fs.existsSync.withArgs('/test/folder/file2.html').returns(false);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, {}, mockDependencies);
      
      expect(result.success).to.be.false;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(1);
      expect(result.failedFiles).to.equal(1);
      expect(result.results).to.have.length(2);
    });

    it('should use custom baseFolder when provided', async function () {
      const folderPath = '/custom/base/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const customBaseFolder = '/custom/base';
      const options = { 
        fileExtensions: ['.html'],
        baseFolder: customBaseFolder,
      };
      
      // Mock folder exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      mockDependencies.getAllFiles.returns(['/custom/base/folder/file1.html', '/custom/base/folder/sub/file2.html']);
      
      // Mock file exists for each file - this is crucial!
      mockDependencies.fs.existsSync.withArgs('/custom/base/folder/file1.html').returns(true);
      mockDependencies.fs.existsSync.withArgs('/custom/base/folder/sub/file2.html').returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock path operations
      mockDependencies.path.relative.withArgs(customBaseFolder, '/custom/base/folder/file1.html').returns('folder/file1.html');
      mockDependencies.path.relative.withArgs(customBaseFolder, '/custom/base/folder/sub/file2.html').returns('folder/sub/file2.html');
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(2);
      expect(result.uploadedFiles).to.equal(2);
      expect(result.failedFiles).to.equal(0);
      
      // Verify that path.relative was called with the custom baseFolder
      expect(mockDependencies.path.relative.calledTwice).to.be.true;
      expect(mockDependencies.path.relative.firstCall.args[0]).to.equal(customBaseFolder);
      expect(mockDependencies.path.relative.firstCall.args[1]).to.equal('/custom/base/folder/file1.html');
      expect(mockDependencies.path.relative.secondCall.args[0]).to.equal(customBaseFolder);
      expect(mockDependencies.path.relative.secondCall.args[1]).to.equal('/custom/base/folder/sub/file2.html');
    });

    it('should use folderPath as baseFolder when baseFolder is not provided', async function () {
      const folderPath = '/test/folder';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      const options = { fileExtensions: ['.html'] };
      
      // Mock folder exists
      mockDependencies.fs.existsSync.returns(true);
      mockDependencies.fs.statSync.returns({ isDirectory: () => true });
      mockDependencies.getAllFiles.returns(['/test/folder/file1.html']);
      
      // Mock file exists
      mockDependencies.fs.existsSync.withArgs('/test/folder/file1.html').returns(true);
      mockDependencies.fs.createReadStream.returns({ pipe: () => {} });
      
      // Mock path operations
      mockDependencies.path.relative.withArgs(folderPath, '/test/folder/file1.html').returns('file1.html');
      
      // Mock fetch
      mockDependencies.fetch.resolves({ 
        ok: true, 
        status: 200, 
        statusText: 'OK', 
        text: async () => 'success', 
      });

      const result = await uploadFolder(folderPath, uploadUrl, authToken, options, mockDependencies);
      
      expect(result.success).to.be.true;
      expect(result.totalFiles).to.equal(1);
      expect(result.uploadedFiles).to.equal(1);
      
      // Verify that uploadFile was called with folderPath as baseFolder
      expect(mockDependencies.path.relative.calledOnce).to.be.true;
      expect(mockDependencies.path.relative.firstCall.args[0]).to.equal(folderPath);
      expect(mockDependencies.path.relative.firstCall.args[1]).to.equal('/test/folder/file1.html');
    });
  });
}); 