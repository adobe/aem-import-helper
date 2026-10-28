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
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3; // maximum number of retries
const XML_CONTENT_TYPES = new Set(['text/xml', 'application/xml']);
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
 * Build an error describing an unexpected response from the CRX package manager.
 * @param {string} reason - Why the response was rejected.
 * @param {Response} response - The fetch response.
 * @param {string} body - The response body.
 * @return {Error}
 */
function unexpectedResponseError(reason, response, body) {
  const contentType = response.headers.get('content-type') || 'none';
  return new Error(`Failed to install package: ${reason} `
    + `(status: ${response.status} ${response.statusText}, content-type: ${contentType}, body: "${bodySnippet(body)}")`);
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

      const body = await fetchResponse.text().catch(() => '');

      if (fetchResponse.status >= 300 && fetchResponse.status < 400) {
        const location = fetchResponse.headers.get('location');
        throw unexpectedResponseError(`unexpected redirect${location ? ` to ${location}` : ''}`, fetchResponse, body);
      }

      // AEM returns a 200 status code even if the package installation fails, but if the response was not ok,
      // throw an error.
      if (!fetchResponse.ok) {
        throw unexpectedResponseError('unexpected status', fetchResponse, body);
      }

      // A hibernated environment answers with a 200 and an HTML status page, so only parse XML responses.
      const contentType = (fetchResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!XML_CONTENT_TYPES.has(contentType)) {
        throw unexpectedResponseError('response is not a package manager XML response', fetchResponse, body);
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
      if (attempt === MAX_RETRIES) {
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
}

