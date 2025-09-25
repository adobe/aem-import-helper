// create a test case for the package-modifier.js file that will test to see if the 
// modified zip file contains all the files that were in the original zip file.

import { expect } from 'chai';
import fs from 'fs';
import { prepareModifiedPackage } from '../../src/aem/package-modifier.js';
import unzipper from 'unzipper';

describe('package-modifier', () => {
  const originalZipPath = 'test/aem/fixtures/wknd-trendsetters/wknd-trendsetters.zip';
  const destDir = 'tmp/original';
  const modifiedDestDir = 'tmp/modified';
  let assetMap;

  beforeEach(() => {
    assetMap = assetMap = new Map(
      Object.entries(JSON.parse(
        fs.readFileSync('test/aem/fixtures/wknd-trendsetters/asset-mapping.json', 'utf8'))));
  });

  afterEach(() => {
    fs.rmSync('tmp', { recursive: true });
  });


  /** 
   * Unzip the given zip files into the given directories.
   * @param {Array<[string, string]>} zips - Array of zip files and directories to unzip.
   * @returns {Promise<void>}
   */
  const extractZipFiles = async (zips) => {
    for (const [zipPath, zipDir] of zips) {
      const directory = await unzipper.Open.file(zipPath);
      await directory.extract({ path: zipDir });
    }
  };

  /**
   * Make sure that no files have been added or removed when the images have not been 
   * onverted to PNG.
   */
  it('zip file contains all files without image conversion', async () => {
    const { modifiedZipPath } = await prepareModifiedPackage(originalZipPath, assetMap, false);

    await extractZipFiles([
      [originalZipPath, destDir],
      [modifiedZipPath, modifiedDestDir],
    ]);

    const originalFilesArray = fs.readdirSync(destDir, { recursive: true });
    const modifiedFilesArray = fs.readdirSync(modifiedDestDir, { recursive: true });

    expect(originalFilesArray).to.deep.equal(modifiedFilesArray);
  });

  /**
   * Make sure that no files have been added or removed when the images have been 
   * converted to PNG.
   */
  it('zip file contains all files with image conversion', async () => {
    const { modifiedZipPath } = await prepareModifiedPackage(originalZipPath, assetMap, true);

    await extractZipFiles([
      [originalZipPath, destDir],
      [modifiedZipPath, modifiedDestDir],
    ]);

    const originalFilesArray = fs.readdirSync(destDir, { recursive: true });
    const modifiedFilesArray = fs.readdirSync(modifiedDestDir, { recursive: true });

    expect(originalFilesArray).to.deep.equal(modifiedFilesArray);
  });
});