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
import fs from 'fs';
import { FormData, File } from 'formdata-node';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { parseStringPromise } from 'xml2js';

const BASE_DELAY = 5000; // base delay in milliseconds
// Maximum number of attempts: defaults to 3 when unset or invalid, and is at least 1.
const PARSED_MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10);
const MAX_RETRIES = Number.isNaN(PARSED_MAX_RETRIES) ? 3 : Math.max(1, PARSED_MAX_RETRIES);
const XML_CONTENT_TYPES = new Set(['text/xml', 'application/xml']);
// Package manager XML, recognised even if a proxy dropped or rewrote the Content-Type header.
const CRX_XML_START = /^\uFEFF?\s*<(\?xml[\s?]|crx[\s>])/i;
const BODY_SNIPPET_LENGTH = 200;

/**
 * Build a short, single-line snippet of a response body for error messages.
 * @param {string} body - The response body.
 * @return {string} The first BODY_SNIPPET_LENGTH characters of the whitespace-collapsed body.
 */
function bodySnippet(body) {
  const collapsed = (body || '').replace(/\s+/g, ' ').trim();
  return collapsed.length > BODY_SNIPPET_LENGTH
    ? `${collapsed.substring(0, BODY_SNIPPET_LENGTH)}...`
    : collapsed;
}

/**
 * Extract the <title> of an HTML page, which usually says more than the start of its markup.
 * @param {string} body - The response body.
 * @return {string|null}
 */
function htmlTitle(body) {
  const match = (body || '').match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1].replace(/\s+/g, ' ').trim();
  return title || null;
}

/**
 * Build an error describing an unexpected response from the CRX package manager.
 * @param {string} reason - Why the response was rejected.
 * @param {Response} response - The fetch response.
 * @param {string} body - The response body.
 * @param {Object} [options={}]
 * @param {boolean} [options.retryable=true] - Whether retrying the request can succeed.
 * @return {Error}
 */
function unexpectedResponseError(reason, response, body, { retryable = true } = {}) {
  const contentType = response.headers.get('content-type') || 'none';
  const title = htmlTitle(body);
  const error = new Error(`Failed to install package: ${reason} `
    + `(status: ${response.status} ${response.statusText}, content-type: ${contentType}`
    + `${title ? `, title: "${title}"` : ''}, body: "${bodySnippet(body)}")`);
  error.retryable = retryable;
  return error;
}

/**
 * Parse the XML response from the CRX package manager. If the response is successful, return true.
 * Otherwise, return the error message.
 * @param {string} xml - The XML response from the CRX package manager.
 * @return {Promise<*|string|boolean>}
 */
async function parseCrxResponse(xml) {
  const result = await parseStringPromise(xml, { explicitArray: false });
  const statusCode = result?.crx?.response?.status?.$?.code;
  if (statusCode === '200') {
    return true;
  } else {
    return result?.crx?.response?.status?._ || 'Unknown error';
  }
}

/**
 * Upload and force install the package to AEM.
 * @param {string} target - The target AEM environment
 * @param {string} token - The user's Bearer token.
 * @param {string} packagePath - The path to the package.
 * @returns {Promise<Response>} The response from the AEM server.
 */
export async function installPackage(target, token, packagePath) {
  const endpoint = `${target}/crx/packmgr/service.jsp`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const file = new File([fs.readFileSync(packagePath)], 'file');
    const formData = new FormData();
    formData.set('install', 'true');
    formData.set('file', file);

    try {
      const fetchResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
        },
        body: formData,
        // A redirect (e.g. to a login or traffic-filter page) means the package was not installed.
        redirect: 'manual',
      });

      let body;
      try {
        body = await fetchResponse.text();
      } catch (readError) {
        throw unexpectedResponseError(`failed to read response body: ${readError.message}`, fetchResponse, '');
      }

      // Redirects (login, traffic filter) and auth failures will not change on retry.
      if (fetchResponse.status >= 300 && fetchResponse.status < 400) {
        const location = fetchResponse.headers.get('location');
        throw unexpectedResponseError(
          `unexpected redirect${location ? ` to ${location}` : ''}, the environment may be behind a login page`,
          fetchResponse,
          body,
          { retryable: false },
        );
      }

      // AEM returns a 200 status code even if the package installation fails, but if the response was not ok,
      // throw an error.
      if (!fetchResponse.ok) {
        const authFailure = fetchResponse.status === 401 || fetchResponse.status === 403;
        throw unexpectedResponseError(
          authFailure ? 'not authorized, check the token' : 'unexpected status',
          fetchResponse,
          body,
          { retryable: !authFailure },
        );
      }

      // A hibernated environment answers with a 200 and an HTML status page, so only parse XML responses.
      const contentType = (fetchResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!XML_CONTENT_TYPES.has(contentType) && !CRX_XML_START.test(body)) {
        throw unexpectedResponseError(
          'response is not a package manager XML response, the environment may be hibernated or behind a login page',
          fetchResponse,
          body,
          { retryable: false },
        );
      }

      let response;
      try {
        response = await parseCrxResponse(body);
      } catch (parseError) {
        throw unexpectedResponseError(`invalid XML response: ${bodySnippet(parseError.message)}`, fetchResponse, body);
      }

      if (response !== true) {
        throw new Error(`Failed to install package: ${response}`);
      }
      console.info(chalk.yellow(`Package installed successfully at ${endpoint}.`));
      return fetchResponse;
    } catch (error) {
      if (error.retryable === false) {
        console.error(chalk.red('Failed to install package, not retrying.'));
        throw error;
      } else if (attempt === MAX_RETRIES) {
        console.error(chalk.red('Max retries reached. Failed to install package.'));
        throw error;
      } else {
        const retryDelay = BASE_DELAY * 2 ** (attempt - 1);
        console.warn(chalk.yellow(`Retrying package install (${attempt}/${MAX_RETRIES}) in ${retryDelay}ms...`));
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay);
        });
      }
    }
  }
  /* c8 ignore next */
  throw new Error('Failed to install package: no attempt was made');
}

