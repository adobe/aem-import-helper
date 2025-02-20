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

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const HEX = 'hex';
const UTF8 = 'utf8';
const ALGORITHM = 'aes-256-cbc';

// Load or generate an encryption key
function loadOrCreateKey() {
  const KEY_FILE = path.resolve(process.cwd(), 'secret.key');

  if (!fs.existsSync(KEY_FILE)) {
    const key = crypto.randomBytes(32); // 256-bit key
    fs.writeFileSync(KEY_FILE, key);
  }
  return fs.readFileSync(KEY_FILE);
}

// Encrypt function
function encrypt(text) {
  const KEY = loadOrCreateKey();

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, UTF8, HEX);
  encrypted += cipher.final(HEX);
  return `${iv.toString(HEX)}:${encrypted}`;
}

// Decrypt function
function decrypt(encryptedText) {
  const KEY = loadOrCreateKey();

  const [iv, encrypted] = encryptedText.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, HEX));
  let decrypted = decipher.update(encrypted, HEX, UTF8);
  decrypted += decipher.final(UTF8);
  return decrypted;
}

// Load credentials
export function loadCredentials() {
  const CONFIG_FILE = path.resolve(process.cwd(), 'aem_config.json');

  if (fs.existsSync(CONFIG_FILE)) {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE));
    data.password = decrypt(data.password);
    return data;
  }
  return null;
}

// Save credentials securely
export function saveCredentials(url, username, password) {
  const CONFIG_FILE = path.resolve(process.cwd(), 'aem_config.json');

  const data = {
    url,
    username,
    password: encrypt(password),
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}
