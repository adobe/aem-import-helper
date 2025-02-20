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

/* eslint-env mocha */

import { expect, use } from 'chai';
import sinon from 'sinon';
import { runImportJobAndPoll } from '../../src/import/import-helper.js';
import chaiAsPromised from 'chai-as-promised';
import {
  xwalkJInProgressResponse,
  xwalkJobCompletedResponse,
  xwalkProgressResponse,
} from './fixtures/example-responses.js';

use(chaiAsPromised);

describe('Xwalk import tests', () => {
  let fetchStub;
  let isJobComplete = true;

  const xwalkProject = {
    urls: [
      'https://example.com/path/to/resource-1',
    ],
    modelsPath: './test/import/fixtures/xwalk/component-models.json',
    filtersPath: './test/import/fixtures/xwalk/component-filters.json',
    definitionsPath: './test/import/fixtures/xwalk/component-definition.json',
    options: {
      type: 'xwalk',
      data: {
        siteName: 'test-site',
        assetFolder: 'test-asset',
      },
    },
    pollInterval: 1,
  }

  beforeEach(() => {
    // Mock fetch(..)
    fetchStub = sinon.stub(globalThis, 'fetch')
    fetchStub.callsFake((url, options) => {
      const { body } = options;
      const { pathname } = url;

      // POST handlers
      if (options.method === 'POST' && pathname === '/api/v1/tools/import/jobs' && body instanceof FormData) {
        // This is a request to start a new job
        const urls = JSON.parse(body.get('urls'));
        return new Response(JSON.stringify({
          ...xwalkJInProgressResponse,
          urlCount: urls.length,
        }));
      }
      else if (options.method === 'POST' && pathname.endsWith('/result')) {
        // This is a request to get the job result
        return new Response(JSON.stringify(xwalkJInProgressResponse));
      }
      // GET handlers
      else if (options.method === 'GET' && pathname.startsWith('/api/v1/tools/import/jobs/')) {
        // This is a request to poll the job status
        if (!isJobComplete) {
          // Job will be complete on next status request
          isJobComplete = true;
          // Return a RUNNING status
          return new Response(JSON.stringify(xwalkJInProgressResponse));
        } else {
          // Return a COMPLETE status
          return new Response(JSON.stringify(xwalkJobCompletedResponse));
        }
      } else if (options.method === 'GET' && pathname.endsWith('/progress')) {
        // This is a request to get the job progress
        return new Response(JSON.stringify(xwalkProgressResponse));
      }
      // Unexpected request pattern
      else {
        throw new Error('Unexpected fetch call');
      }
    });

  });

  afterEach(() => {
    sinon.restore();
  });

  /**
   * The following test cases are expected to throw an error when required
   * fields are not provided.
   */
  it ('test required fields', async () => {
    let project = { ...xwalkProject, modelsPath: null };
    // expect to throw an error when modelsPath is not provided
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'You must provide a component-models.json file when performing an xwalk import');

    project = { ...xwalkProject, filtersPath: null };
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'You must provide a component-filters.json file when performing an xwalk import');

    project = { ...xwalkProject, definitionsPath: null };
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'You must provide a component-definition.json file when performing an xwalk import');
  })

  /**
   * This test validates that the user input for the files exist
   */
  it('test that the model files exists', async () => {
    let project = { ...xwalkProject, modelsPath: 'non-existent-file.json' };
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'The file non-existent-file.json does not exist');

    project = { ...xwalkProject, filtersPath: 'non-existent-file.json' };
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'The file non-existent-file.json does not exist');

    project = { ...xwalkProject, definitionsPath: 'non-existent-file.json' };
    await expect(runImportJobAndPoll(project)).to.be.rejectedWith(
      'The file non-existent-file.json does not exist');
  });


  it('expect to run the xwalk import job and poll for status', async () => {
    await runImportJobAndPoll(xwalkProject);
    expect(fetchStub.callCount).to.equal(3);
    const newJobRequestCall = fetchStub.getCall(0);
    const checkStatusCall = fetchStub.getCall(1);
    const getResultCall = fetchStub.getCall(2);

    // Check the first request
    expect(newJobRequestCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs');
    expect(newJobRequestCall.args[1].method).to.equal('POST');
    const body = newJobRequestCall.args[1].body;
    expect(body instanceof FormData).to.be.true;
    expect(JSON.parse(body.get('urls')).length).to.equal(1);

    // Check the 2nd request
    expect(checkStatusCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs/894b3713f102');
    expect(checkStatusCall.args[1].method).to.equal('GET');

    // Check the 3rd request
    expect(getResultCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs/894b3713f102/result');
    expect(getResultCall.args[1].method).to.equal('POST');
  });
});
