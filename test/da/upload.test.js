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
import fs from 'fs';
import FormData from 'form-data';
import { uploadFile, uploadFiles, uploadFolder } from '../../src/da/upload.js';

describe('upload', function () {
  let fsStub;
  let formDataStub;

  beforeEach(() => {
    // Clear any existing stubs
    sinon.restore();
    
    // Create fresh stubs
    fsStub = sinon.stub(fs);
    formDataStub = sinon.stub(FormData.prototype);
    
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
      fsStub.existsSync.returns(false);

      try {
        await uploadFile(filePath, uploadUrl, authToken);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('File not found');
      }
    });

    it.skip('should validate file existence before upload', async function () {
      const filePath = '/test/path/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file exists
      fsStub.existsSync.returns(true);
      fsStub.createReadStream.returns({ pipe: () => {} });
      
      // Mock FormData
      formDataStub.append.returns();
      formDataStub.getHeaders.returns({ 'content-type': 'multipart/form-data' });
      
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('success'),
      };
      
      // Stub fetch to return our mock response
      const fetchStub = sinon.stub().resolves(mockResponse);
      sinon.stub(global, 'fetch').callsFake(fetchStub);

      const result = await uploadFile(filePath, uploadUrl, authToken);

      expect(fetchStub.calledOnce).to.be.true;
      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.filePath).to.equal(filePath);
    });

    it.skip('should handle upload failure with non-ok response', async function () {
      const filePath = '/test/path/file.jpg';
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file existence
      fsStub.existsSync.returns(true);
      fsStub.createReadStream.returns({ pipe: () => {} });
      
      // Mock FormData
      formDataStub.append.returns();
      formDataStub.getHeaders.returns({ 'content-type': 'multipart/form-data' });
      
      // Mock failed response
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };
      
      // Stub fetch to return our mock response
      const fetchStub = sinon.stub().resolves(mockResponse);
      sinon.stub(global, 'fetch').callsFake(fetchStub);

      try {
        await uploadFile(filePath, uploadUrl, authToken);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Upload failed with status: 401');
        expect(fetchStub.calledOnce).to.be.true;
      }
    });
  });

  describe('uploadFiles', function () {
    it.skip('should handle mixed success and failure results', async function () {
      const filePaths = ['/test/file1.jpg', '/test/file2.png'];
      const uploadUrl = 'https://admin.da.live/source/org/repo';
      const authToken = 'test-token';
      
      // Mock file existence for first file, not for second
      fsStub.existsSync.withArgs('/test/file1.jpg').returns(true);
      fsStub.existsSync.withArgs('/test/file2.png').returns(false);
      fsStub.createReadStream.returns({ pipe: () => {} });
      
      // Mock FormData
      formDataStub.append.returns();
      formDataStub.getHeaders.returns({ 'content-type': 'multipart/form-data' });
      
      // Mock successful response for first file
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('success'),
      };
      
      // Stub fetch to return our mock response
      const fetchStub = sinon.stub().resolves(mockResponse);
      sinon.stub(global, 'fetch').callsFake(fetchStub);

      const results = await uploadFiles(filePaths, uploadUrl, authToken);

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
      fsStub.existsSync.returns(false);

      try {
        await uploadFolder(folderPath, uploadUrl, authToken);
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
      fsStub.existsSync.returns(true);
      fsStub.statSync.returns({ isDirectory: () => false });

      try {
        await uploadFolder(folderPath, uploadUrl, authToken);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Path is not a directory');
      }
    });
  });
}); 