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
import { expect } from 'chai';
import { getDamRootFolder } from '../../src/aem/aem-util.js';

describe('aem-utils', function () {
  /**
   * Test getDamRootFolder function to return the correct root folder that's found
   * in the asset mapping object.
   */
  it('test getDamRootFolder', async () => {
    expect(getDamRootFolder(new Map())).to.equal(null);

    let assetMapping = new Map([
      ['http://www.example.com/image.png', '/content/dam/xwalk/image.png'],
    ]);
    expect(getDamRootFolder(assetMapping)).to.equal('xwalk');

    assetMapping.clear();

    assetMapping.set('http://www.example.com/image.png', '/content/dam/image.png');
    expect(getDamRootFolder(assetMapping)).to.equal(null);

    assetMapping.clear();
    assetMapping.set('http://www.example.com/image.png', '/content/dam/image.png');
    assetMapping.set('http://www.example.com/image2.png', '/content/dam/first/image.png');
    expect(getDamRootFolder(assetMapping)).to.equal('first');

    assetMapping.clear();
    assetMapping.set('http://www.example.com/image.png', '/image.png');
    assetMapping.set('http://www.example.com/image2.png', '/content/dam/first/image.png');
    assetMapping.set('http://www.example.com/image3.png', '/content/dam/second/image.png');
    expect(getDamRootFolder(assetMapping)).to.equal('first');
  });
});
