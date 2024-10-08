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

export const jobInProgressResponse = {
  id: '318cab4f-f793-4e72-be20-894b3713f102',
  baseURL: 'https://example.com',
  options: { enableJavascript: false },
  startTime: '2024-10-04T15:23:35.512Z',
  status: 'RUNNING',
  urlCount: 5,
  initiatedBy: { apiKeyName: "Bruce's Key", userAgent: 'node' },
  hasCustomHeaders: false,
  hasCustomImportJs: false
};

export const progressResponse = {
  pending: 5,
  redirect: 0,
  completed: 0,
  failed: 0
};

export const jobCompletedResponse = {
  id: '318cab4f-f793-4e72-be20-894b3713f102',
  baseURL: 'https://example.com',
  options: { enableJavascript: false },
  startTime: '2024-10-04T15:23:35.512Z',
  endTime: '2024-10-04T15:23:52.485Z',
  duration: 16973,
  status: 'COMPLETE',
  urlCount: 5,
  initiatedBy: { apiKeyName: "Bruce's Key", userAgent: 'node' },
  successCount: 5,
  failedCount: 0,
  redirectCount: 0,
  hasCustomHeaders: false,
  hasCustomImportJs: false
}

export const jobResultResponse = {
  id: "318cab4f-f793-4e72-be20-894b3713f102",
  downloadUrl: "https://example.s3.region.amazonaws.com/imports/318cab4f-f793-4e72-be20-894b3713f102/import-result.zip?X-Amz-Algorithm=AWS4-..."
}
