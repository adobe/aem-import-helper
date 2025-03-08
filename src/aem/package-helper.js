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
const MAX_RETRIES = process.env.MAX_RETRIES || 3; // maximum number of retries

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
      });

      // AEM returns a 200 status code even if the package installation fails, but if the response was not ok,
      // throw an error.
      if (!fetchResponse.ok) {
        throw new Error(`Failed to install package: ${fetchResponse.status} - ${fetchResponse.statusText}`);
      }

      // now we need to parse the XML response from the CRX package manager
      const xmlResponse = await fetchResponse.text();
      const response = await parseCrxResponse(xmlResponse);

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

