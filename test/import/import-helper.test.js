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
import { expect, use } from 'chai';
import esmock from 'esmock';
import sinon from 'sinon';
import { runImportJobAndPoll } from '../../src/import/import-helper.js';
import chaiAsPromised from 'chai-as-promised';
import {
  jobCompletedResponse, jobInProgressResponse, jobResultResponse, progressResponse
} from './fixtures/example-responses.js';

use(chaiAsPromised);

describe('Import helper tests', () => {
  let fetchStub;
  let isJobComplete = true;

  const exampleParamObject = {
    urls: [
      'https://example.com/path/to/resource-1',
      'https://example.com/path/to/resource-2',
      'https://example.com/path/to/en_ca/resource-3',
      'https://example.com/path/to/fr_ca/about-us',
      'https://example.com/path/to/fr_ca/services',
    ],
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
          ...jobInProgressResponse,
          urlCount: urls.length,
        }));
      }
      else if (options.method === 'POST' && pathname.endsWith('/result')) {
        // This is a request to get the job result
        return new Response(JSON.stringify(jobResultResponse));
      }
      // GET handlers
      else if (options.method === 'GET' && pathname.startsWith('/api/v1/tools/import/jobs/')) {
        // This is a request to poll the job status
        if (!isJobComplete) {
          // Job will be complete on next status request
          isJobComplete = true;
          // Return a RUNNING status
          return new Response(JSON.stringify(jobInProgressResponse));
        } else {
          // Return a COMPLETE status
          return new Response(JSON.stringify(jobCompletedResponse));
        }
      } else if (options.method === 'GET' && pathname.endsWith('/progress')) {
        // This is a request to get the job progress
        return new Response(JSON.stringify(progressResponse));
      }
      // Unexpected request pattern
      else {
        throw new Error('Unexpected fetch call');
      }
    });

  });

  afterEach(() => {
    // Restore the default sandbox here
    sinon.restore();
  });

  describe('runImportJobAndPoll tests', () => {
    it ('should fail when required params are missing', async () => {
      const testParams = {
        urls: [],
      };
      await expect(runImportJobAndPoll(testParams)).to.be.rejectedWith(Error, 'No URLs provided');

      testParams.urls = null;
      await expect(runImportJobAndPoll(testParams)).to.be.rejectedWith(Error, 'No URLs provided');
    });

    it ('should create a new job which completes right away', async () => {
      await runImportJobAndPoll(exampleParamObject);

      // Check the fetch requests which are made to the API from the tool
      expect(fetchStub.callCount).to.equal(3);
      const newJobRequestCall = fetchStub.getCall(0);
      const checkStatusCall = fetchStub.getCall(1);
      const getResultCall = fetchStub.getCall(2);

      // Check the first request
      expect(newJobRequestCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs');
      expect(newJobRequestCall.args[1].method).to.equal('POST');
      const body = newJobRequestCall.args[1].body;
      expect(body instanceof FormData).to.be.true;
      expect(JSON.parse(body.get('urls')).length).to.equal(5);

      // Check the 2nd request
      expect(checkStatusCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs/318cab4f-f793-4e72-be20-894b3713f102');
      expect(checkStatusCall.args[1].method).to.equal('GET');

      // Check the 3rd request
      expect(getResultCall.args[0].href).to.equal('https://spacecat.experiencecloud.live/api/v1/tools/import/jobs/318cab4f-f793-4e72-be20-894b3713f102/result');
      expect(getResultCall.args[1].method).to.equal('POST');
    });
  });
});
