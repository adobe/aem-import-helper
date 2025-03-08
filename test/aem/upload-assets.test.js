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

describe('upload assets', function () {

  afterEach(() => {
    sinon.restore();
  });

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
});
