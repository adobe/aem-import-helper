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

// Function to make HTTP requests
export async function makeRequest(url, method, data) {
  const parsedUrl = new URL(url);
  const headers = new Headers({
    'Content-Type': data ? 'application/json' : '',
    'x-api-key': process.env.AEM_IMPORT_API_KEY,
  });

  // FormData requests set the multipart/form-data header (including boundary) automatically
  if (data instanceof FormData) {
    headers.delete('Content-Type');
  }

  const res = await fetch(parsedUrl, {
    method,
    headers,
    body: data,
  });

  if (res.ok) {
    return res.json();
  }

  const body = await res.text();
  throw new Error(`Request failed with status code ${res.status}. `
    + `x-error header: ${res.headers.get('x-error')}, x-invocation-id: ${res.headers.get('x-invocation-id')}, `
    + `Body: ${body}`);
}
