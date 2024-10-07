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

import { parentPort } from 'worker_threads';
import express from 'express';
import path from 'path';
import {getPort} from './assistant-server.js';


const assistantServer = express();
const port = getPort();

// Serve static files from the tools directory
assistantServer.use('/tools', express.static(path.join(process.cwd(), 'tools')));

// Start the server
assistantServer.listen(port, () => {
  if (parentPort) {
    parentPort.postMessage(`Server is running at http://localhost:${port}`);
  }
});
