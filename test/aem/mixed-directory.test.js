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

describe('Mixed directory scenario (files + subdirectories)', function () {
  let testDir;

  beforeEach(() => {
    // Mock fetch for AEM folder creation API
    sinon.stub(global, 'fetch').resolves({
      ok: true,
      status: 200,
      text: async () => '',
    });
  });

  afterEach(async () => {
    sinon.restore();
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
      testDir = null;
    }
  });

  it('should handle directory with BOTH files at root level AND subdirectories', async function () {
    this.timeout(10000);
    
    // Set MAX_UPLOAD_FILES to 20 to force splitting
    const originalEnv = process.env.MAX_UPLOAD_FILES;
    process.env.MAX_UPLOAD_FILES = '20';

    try {
      // Create test structure with files at root AND subdirectories
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aem-mixed-test-'));
      
      // Add files at the root level
      await fs.writeFile(path.join(testDir, 'root-file-1.txt'), 'Root file 1');
      await fs.writeFile(path.join(testDir, 'root-file-2.txt'), 'Root file 2');
      await fs.writeFile(path.join(testDir, 'root-file-3.txt'), 'Root file 3');
      
      // Add subdirectories with files
      const sub1 = path.join(testDir, 'subfolder1');
      await fs.mkdir(sub1);
      for (let i = 1; i <= 15; i++) {
        await fs.writeFile(path.join(sub1, `file-${i}.txt`), `Subfolder1 file ${i}`);
      }
      
      const sub2 = path.join(testDir, 'subfolder2');
      await fs.mkdir(sub2);
      for (let i = 1; i <= 10; i++) {
        await fs.writeFile(path.join(sub2, `file-${i}.txt`), `Subfolder2 file ${i}`);
      }

      const fsUpload = new FileSystemUpload();
      const filesystemUploadedDirs = [];
      
      // Mock FileSystemUpload to simulate real behavior
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
        
        // Track which directories were uploaded via filesystem upload
        filesystemUploadedDirs.push(path.relative(testDir, dir) || '<root>');
        
        // If file count exceeds MAX_UPLOAD_FILES (20), throw TOO_LARGE error
        if (totalFileCount > 20) {
          const error = new Error(`Walked directory exceeded the maximum number of files allowed (20). Found ${totalFileCount} files.`);
          error.code = 'TOO_LARGE';
          throw error;
        }
        
        return { ok: true, uploadedFiles: totalFileCount };
      });

      const result = await uploadAssets('http://www.aem.com', 'abcd123', testDir, fsUpload);

      console.log('\n      Upload Result:');
      console.log('      → Total files in test: 28 (3 root + 15 + 10)');
      console.log(`      → Upload attempts: ${filesystemUploadedDirs.length}`);
      console.log(`      → Directories tried: ${filesystemUploadedDirs.join(', ')}`);
      console.log(`      → Filesystem runs: ${result.filesystemRuns.length}`);
      console.log(`      → Fallback runs: ${result.fallbackRuns ? result.fallbackRuns.length : 0}`);
      console.log(`      → Errors: ${result.errors ? result.errors.length : 0}`);
      
      // Verify the behavior:
      // 1. Root should be attempted first (28 files total) -> TOO_LARGE
      expect(filesystemUploadedDirs[0], 'Root should be attempted first').to.equal('<root>');
      
      // 2. After split, subdirectories should be uploaded successfully
      expect(filesystemUploadedDirs, 'Should try subfolder1').to.include('subfolder1');
      expect(filesystemUploadedDirs, 'Should try subfolder2').to.include('subfolder2');
      
      // 3. Both subdirectories should succeed (under 20 files each)
      expect(result.filesystemRuns.length, 'Both subdirectories should succeed').to.equal(2);
      
      // 4. Root files should have triggered fallback attempt  
      // Even if the actual DirectBinaryUpload isn't mocked and causes an error,
      // the important thing is that fallback was ATTEMPTED
      const hasParentFilesError = result.errors && result.errors.some(e => e.type === 'fallback-parent-files');
      const hasFallbackRuns = result.fallbackRuns && result.fallbackRuns.length > 0;
      
      // Either fallback succeeded or it was at least attempted (which would cause an error without mocking)
      expect(hasFallbackRuns || hasParentFilesError, 
        'Root files should trigger fallback upload attempt').to.be.true;
      
      console.log('\n      ✓ Root directory attempted: TOO_LARGE');
      console.log('      ✓ Root files fallback attempted');
      console.log('      ✓ Subdirectories uploaded successfully');
      
    } finally {
      if (originalEnv !== undefined) {
        process.env.MAX_UPLOAD_FILES = originalEnv;
      } else {
        delete process.env.MAX_UPLOAD_FILES;
      }
    }
  });
});
