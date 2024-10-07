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
import puppeteer from 'puppeteer';
import {helperEvents} from '../events.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36';

/**
 * Waits for the DOM to settle by using a MutationObserver.
 * @param page The Puppeteer page instance.
 * @param timeout The maximum amount of time to wait (in milliseconds).
 * @returns A promise that resolves when the DOM has settled.
 */
async function waitForDomToSettle(page, timeout = 5000) {
  await page.evaluate((timeout) => {
    return new Promise((resolve) => {
      let timer = null;

      const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 100); // The DOM is considered settled if no changes occur for 100ms
      });

      observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, timeout);
    });
  }, timeout);
}

async function fetchUrlContent(url) {
  // Launch a new browser instance
  const browser = await puppeteer.launch();

  try {
    // Open a new page
    const page = await browser.newPage();
    // Disable JavaScript to speed up page loading
    // await page.setJavaScriptEnabled(false);
    // Set the user agent to mimic an actual Chrome browser
    await page.setUserAgent(USER_AGENT);

    // Navigate to the provided URL
    await page.goto(url, { waitUntil: 'networkidle0' });

    helperEvents.emit('progress', `Waiting for ${url} to settle...`);
    await waitForDomToSettle(page);

    //get the title of the page
    const title = await page.evaluate(() => document.title);

    // Get the page content (HTML)
    const documentContent = await page.evaluate(() => document.documentElement.outerHTML);

    // take a screenshot
    const screenshot = await page.screenshot({ fullPage: true, type: 'png', encoding: 'base64' });

    helperEvents.emit('progress', `Loaded: ${title} (${documentContent.length} bytes)`);

    return [documentContent, screenshot];
  } catch (error) {
    console.error('Error loading document:', error);
    throw error;
  } finally {
    // Close the browser
    await browser.close();
  }
}

export const fetchDocument = async (url, options = {}) => {
  helperEvents.emit('start', `Fetching document from ${url}`);

  try {
    const { documents = new Set() } = options;
    const documentEntry = Array.from(documents).find((entry) => entry.url === url);
    let {content: documentContent, screenshot: documentScreenshot = ''} = documentEntry || {};
    if (!documentEntry) {
      [documentContent, documentScreenshot] = await fetchUrlContent(url);
    } else {
      helperEvents.emit('progress', `Loaded ${url} from document cache`);
    }

    // write the document and screenshot back to the manifest
    if (!documentEntry) {
      documents.add({
        url,
        content: documentContent,
        screenshot: documentScreenshot,
      });
    }

    helperEvents.emit('complete');

    return [documentContent, documentScreenshot];

  } catch (error) {
    console.error('Error fetching document:', error);
    throw error;
  }
};
