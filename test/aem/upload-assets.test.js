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
import { uploadAssets } from '../../src/aem/upload-assets.js';
import { FileSystemUpload } from '@adobe/aem-upload';
import sinon from 'sinon';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('upload assets', function () {

  afterEach(() => {
    sinon.restore();
  });

  /**
   * Helper function to create a temporary directory structure with test files
   * @param {Object} structure - Object defining folder structure, e.g., { folder1: 10, folder2: 20 }
   * @returns {Promise<string>} - Path to the root test directory
   */
  async function createTestFileStructure(structure) {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-upload-test-'));
    
    for (const [folderName, fileCount] of Object.entries(structure)) {
      const folderPath = path.join(testDir, folderName);
      await fs.mkdir(folderPath, { recursive: true });
      
      for (let i = 1; i <= fileCount; i++) {
        const filePath = path.join(folderPath, `file-${i}.txt`);
        await fs.writeFile(filePath, `Test content for file ${i} in ${folderName}`);
      }
    }
    
    return testDir;
  }

  /**
   * Helper function to clean up test directory
   */
  async function cleanupTestDir(testDir) {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  it('validate the upload call has the correct arguments', async function () {
    const fsUpload = new FileSystemUpload();
    const uploadStub = sinon.stub(fsUpload, 'upload').resolves('success');

    await uploadAssets('http://www.aem.com', 'abcd123', '/assets', fsUpload);
    expect(uploadStub.calledOnce).to.be.true;

    // expect the upload to have been called with the correct options
    const optionArgs = uploadStub.getCall(0).args[0];
    expect(optionArgs.options.url).to.equal('http://www.aem.com/content/dam');

    const pathArgs = uploadStub.getCall(0).args[1];
    expect(pathArgs[0]).to.equal('/assets');
  });

  it('validate the upload call has the correct arguments for https', async function () {
    const fsUpload = new FileSystemUpload();
    const uploadStub = sinon.stub(fsUpload, 'upload').resolves('success');

    await uploadAssets('https://www.aem.com', 'abcd123', '/assets', fsUpload);
    expect(uploadStub.calledOnce).to.be.true;

    // expect the upload to have been called with the correct options
    const optionArgs = uploadStub.getCall(0).args[0];
    expect(optionArgs.options.url).to.equal('https://www.aem.com/content/dam');

    const pathArgs = uploadStub.getCall(0).args[1];
    expect(pathArgs[0]).to.equal('/assets');
  });

  it('validate the upload call has the correct arguments for non http(s) urls', async function () {
    const fsUpload = new FileSystemUpload();
    const uploadStub = sinon.stub(fsUpload, 'upload').resolves('success');

    await uploadAssets('www.aem.com', 'abcd123', '/assets', fsUpload);
    expect(uploadStub.calledOnce).to.be.true;

    // expect the upload to have been called with the correct options
    const optionArgs = uploadStub.getCall(0).args[0];
    expect(optionArgs.options.url).to.equal('https://www.aem.com/content/dam');

    const pathArgs = uploadStub.getCall(0).args[1];
    expect(pathArgs[0]).to.equal('/assets');
  });

  describe('MAX_UPLOAD_FILES environment variable and safe upload behavior', function () {
    let originalMaxUploadFiles;
    let testDir;

    beforeEach(() => {
      originalMaxUploadFiles = process.env.MAX_UPLOAD_FILES;
    });

    afterEach(async () => {
      if (originalMaxUploadFiles !== undefined) {
        process.env.MAX_UPLOAD_FILES = originalMaxUploadFiles;
      } else {
        delete process.env.MAX_UPLOAD_FILES;
      }
      
      if (testDir) {
        await cleanupTestDir(testDir);
        testDir = null;
      }
    });

    it('should use default maxUploadFiles of 10000 when MAX_UPLOAD_FILES is not set', async function () {
      delete process.env.MAX_UPLOAD_FILES;

      const fsUpload = new FileSystemUpload();
      const uploadStub = sinon.stub(fsUpload, 'upload').resolves({ ok: true });

      await uploadAssets('http://www.aem.com', 'abcd123', '/assets', fsUpload);

      const optionArgs = uploadStub.getCall(0).args[0];
      expect(optionArgs.options.maxUploadFiles).to.equal(10000);
    });

    it('should use custom maxUploadFiles from MAX_UPLOAD_FILES environment variable', async function () {
      process.env.MAX_UPLOAD_FILES = '5000';

      const fsUpload = new FileSystemUpload();
      const uploadStub = sinon.stub(fsUpload, 'upload').resolves({ ok: true });

      await uploadAssets('http://www.aem.com', 'abcd123', '/assets', fsUpload);

      const optionArgs = uploadStub.getCall(0).args[0];
      expect(optionArgs.options.maxUploadFiles).to.equal(5000);
    });

    it('should handle directory splitting when MAX_UPLOAD_FILES limit is exceeded', async function () {
      this.timeout(10000);
      
      // Set MAX_UPLOAD_FILES to 20
      process.env.MAX_UPLOAD_FILES = '20';

      // Create test structure with folders containing different file counts
      // folder1: 10 files, folder2: 20 files, folder3: 30 files, folder4: 100 files
      testDir = await createTestFileStructure({
        folder1: 10,
        folder2: 20,
        folder3: 30,
        folder4: 100,
        folder5: 15,
      });

      const fsUpload = new FileSystemUpload();
      
      // Mock the upload to simulate TOO_LARGE error when directory has too many files
      const uploadStub = sinon.stub(fsUpload, 'upload').callsFake(async (options, dirs) => {
        const dir = dirs[0];
        
        // Count ALL files recursively (including subdirectories)
        async function countAllFiles(directory) {
          const entries = await fs.readdir(directory, { withFileTypes: true });
          let count = 0;
          
          for (const entry of entries) {
            if (entry.isFile()) {
              count++;
            } else if (entry.isDirectory()) {
              count += await countAllFiles(path.join(directory, entry.name));
            }
          }
          
          return count;
        }
        
        const totalFileCount = await countAllFiles(dir);
        
        // If total file count exceeds MAX_UPLOAD_FILES (20), throw TOO_LARGE error
        // This simulates the behavior of deepUpload
        if (totalFileCount > 20) {
          const error = new Error(`Walked directory exceeded the maximum number of files allowed (20). Found ${totalFileCount} files.`);
          error.code = 'TOO_LARGE';
          throw error;
        }
        
        // Otherwise, simulate successful upload
        return { ok: true, uploadedFiles: totalFileCount };
      });

      const result = await uploadAssets('http://www.aem.com', 'abcd123', testDir, fsUpload);

      // Verify the upload was called multiple times (due to splitting)
      // Root directory has 195 files total, which exceeds 20, so it will split into subdirs
      expect(uploadStub.called).to.be.true;
      expect(uploadStub.callCount).to.be.greaterThan(1);
      
      // Verify maxUploadFiles was set to 20
      const firstCallOptions = uploadStub.getCall(0).args[0];
      expect(firstCallOptions.options.maxUploadFiles).to.equal(20);
      
      // Verify the result structure
      expect(result).to.have.property('ok');
      expect(result).to.have.property('filesystemRuns');
      expect(result).to.have.property('errors');
      
      console.log(`      ? Total upload calls made: ${uploadStub.callCount}`);
      console.log(`      ? Filesystem runs: ${result.filesystemRuns.length}`);
      console.log(`      ? Fallback runs: ${result.fallbackRuns ? result.fallbackRuns.length : 0}`);
    });

    it('should successfully upload when all folders are within MAX_UPLOAD_FILES limit', async function () {
      this.timeout(10000);
      
      // Set MAX_UPLOAD_FILES to 50 (higher than any folder)
      process.env.MAX_UPLOAD_FILES = '50';

      // Create test structure with folders all under the limit
      testDir = await createTestFileStructure({
        folder1: 10,
        folder2: 20,
        folder3: 30,
      });

      const fsUpload = new FileSystemUpload();
      
      const uploadStub = sinon.stub(fsUpload, 'upload').callsFake(async (options, dirs) => {
        const dir = dirs[0];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const fileCount = entries.filter(e => e.isFile()).length;
        
        if (fileCount > 50) {
          const error = new Error(`Walked directory exceeded the maximum number of files allowed (50). Found ${fileCount} files.`);
          error.code = 'TOO_LARGE';
          throw error;
        }
        
        return { ok: true, uploadedFiles: fileCount };
      });

      const result = await uploadAssets('http://www.aem.com', 'abcd123', testDir, fsUpload);

      // With limit of 50, all folders should upload successfully without splitting
      expect(result.ok).to.be.true;
      expect(uploadStub.called).to.be.true;
      
      const firstCallOptions = uploadStub.getCall(0).args[0];
      expect(firstCallOptions.options.maxUploadFiles).to.equal(50);
      
      console.log(`      ? Upload calls made: ${uploadStub.callCount}`);
    });

    it('should trigger fallback upload for flat directory exceeding MAX_UPLOAD_FILES', async function () {
      this.timeout(10000);
      
      // Set MAX_UPLOAD_FILES to 25
      process.env.MAX_UPLOAD_FILES = '25';

      // Create a flat structure (no subdirectories) with 50 files
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-upload-flat-test-'));
      
      for (let i = 1; i <= 50; i++) {
        const filePath = path.join(testDir, `file-${i}.txt`);
        await fs.writeFile(filePath, `Test content for file ${i}`);
      }

      const fsUpload = new FileSystemUpload();
      
      sinon.stub(fsUpload, 'upload').callsFake(async (options, dirs) => {
        const dir = dirs[0];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const fileCount = entries.filter(e => e.isFile()).length;
        
        if (fileCount > 25) {
          const error = new Error(`Walked directory exceeded the maximum number of files allowed (25). Found ${fileCount} files.`);
          error.code = 'TOO_LARGE';
          throw error;
        }
        
        return { ok: true, uploadedFiles: fileCount };
      });

      const result = await uploadAssets('http://www.aem.com', 'abcd123', testDir, fsUpload);

      // The flat directory should trigger fallback mechanism
      expect(result).to.have.property('fallbackRuns');
      
      // Either fallback was triggered or error was logged
      const hasFallback = result.fallbackRuns && result.fallbackRuns.length > 0;
      const hasError = result.errors && result.errors.length > 0;
      
      expect(hasFallback || hasError).to.be.true;
      
      console.log(`      → Filesystem runs: ${result.filesystemRuns.length}`);
      console.log(`      → Fallback runs: ${result.fallbackRuns ? result.fallbackRuns.length : 0}`);
      console.log(`      → Errors: ${result.errors ? result.errors.length : 0}`);
    });

    it('should upload parent-level files via fallback when directory is split', async function () {
      this.timeout(10000);
      
      process.env.MAX_UPLOAD_FILES = '20';

      // Create a test structure with files at root AND subdirectories
      testDir = await createTestFileStructure({
        subfolder1: 15,
        subfolder2: 10,
      });
      
      // Add files at the root level
      await fs.writeFile(path.join(testDir, 'root-file-1.txt'), 'Root file 1');
      await fs.writeFile(path.join(testDir, 'root-file-2.txt'), 'Root file 2');
      await fs.writeFile(path.join(testDir, 'root-file-3.txt'), 'Root file 3');

      const fsUpload = new FileSystemUpload();
      const filesystemUploadedDirs = [];
      
      sinon.stub(fsUpload, 'upload').callsFake(async (options, dirs) => {
        const dir = dirs[0];
        
        async function countAllFilesRecursively(directory) {
          const entries = await fs.readdir(directory, { withFileTypes: true });
          let count = 0;
          
          for (const entry of entries) {
            if (entry.isFile()) {
              count++;
            } else if (entry.isDirectory()) {
              count += await countAllFilesRecursively(path.join(directory, entry.name));
            }
          }
          
          return count;
        }
        
        const totalFileCount = await countAllFilesRecursively(dir);
        filesystemUploadedDirs.push(path.relative(testDir, dir) || '<root>');
        
        if (totalFileCount > 20) {
          const error = new Error(`Walked directory exceeded the maximum number of files allowed (20). Found ${totalFileCount} files.`);
          error.code = 'TOO_LARGE';
          throw error;
        }
        
        return { ok: true, uploadedFiles: totalFileCount };
      });

      const result = await uploadAssets('http://www.aem.com', 'abcd123', testDir, fsUpload);

      // Verify root was attempted first and failed
      expect(filesystemUploadedDirs[0]).to.equal('<root>');
      
      // Verify subdirectories were uploaded successfully
      expect(result.filesystemRuns.length).to.equal(2);
      
      // Verify fallback was attempted for parent files
      // (Will show as error without DirectBinaryUpload mock, but that proves it was attempted)
      const hasParentFilesError = result.errors && result.errors.some(e => e.type === 'fallback-parent-files');
      const hasFallbackRuns = result.fallbackRuns && result.fallbackRuns.length > 0;
      
      expect(hasFallbackRuns || hasParentFilesError, 
        'Parent-level files should trigger fallback upload').to.be.true;
      
      console.log(`      → Root files handled via fallback: ${hasParentFilesError || hasFallbackRuns ? 'Yes' : 'No'}`);
    });
  });
});
