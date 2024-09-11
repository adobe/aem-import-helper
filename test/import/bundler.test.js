/*
 * Copyright 2024 Adobe. All rights reserved.
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
import esmock from 'esmock';
import sinon from 'sinon';

describe('prepareImportScript tests', () => {
  let prepareImportScript;
  let buildSyncStub;

  const bundledCode = 'console.log("This is a test!");';

  beforeEach(async () => {
    buildSyncStub = sinon.stub().returns({
      outputFiles: [{ text: bundledCode }],
    });

    prepareImportScript = await esmock('../../src/import/bundler.js', {
      esbuild: { buildSync: buildSyncStub }
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return a bundled import script', () => {
    const result = prepareImportScript('path/to/import.js', { save: false });

    expect(buildSyncStub.calledOnceWith({
      entryPoints: ['path/to/import.js'],
      bundle: true,
      write: false,
      globalName: 'CustomImportScript',
      format: 'iife',
      platform: 'browser',
      target: ['es2015'],
    })).to.be.true;

    expect(result).to.equal(bundledCode);
  });

  it('should handle errors during the bundling process', () => {
    const error = new Error('Bundling error');
    buildSyncStub.throws(error);

    expect(() => prepareImportScript('path/to/import.js')).to.throw('Bundling error');
    expect(buildSyncStub.calledOnce).to.be.true;
  });
});
