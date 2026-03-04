// create a test case for the package-modifier.js file that will test to see if the 
// modified zip file contains all the files that were in the original zip file.

import { expect } from 'chai';
import fs from 'fs';
import { prepareModifiedPackage, buildExtensionReplacementMap } from '../../src/aem/package-modifier.js';
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
    if (fs.existsSync('tmp')) {
      fs.rmSync('tmp', { recursive: true });
    }
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

  describe('buildExtensionReplacementMap', () => {
    it('should convert renamed file paths to JCR path replacements', () => {
      // assetRootDir maps to /content/dam/test-package in JCR
      const assetRootDir = '/tmp/downloads/test-package';
      const renamedFiles = new Map([
        [
          '/tmp/downloads/test-package/is/image/testcorp/our-people-hero-hero-v2jpg',
          '/tmp/downloads/test-package/is/image/testcorp/our-people-hero-hero-v2jpg.jpg',
        ],
      ]);

      const result = buildExtensionReplacementMap(renamedFiles, assetRootDir);

      expect(result.size).to.equal(1);
      expect(result.get('/content/dam/test-package/is/image/testcorp/our-people-hero-hero-v2jpg'))
        .to.equal('/content/dam/test-package/is/image/testcorp/our-people-hero-hero-v2jpg.jpg');
    });

    it('should handle nested paths under asset root', () => {
      const assetRootDir = '/tmp/downloads/site';
      const renamedFiles = new Map([
        [
          '/tmp/downloads/site/images/deep/photo',
          '/tmp/downloads/site/images/deep/photo.png',
        ],
      ]);

      const result = buildExtensionReplacementMap(renamedFiles, assetRootDir);

      expect(result.size).to.equal(1);
      expect(result.get('/content/dam/site/images/deep/photo'))
        .to.equal('/content/dam/site/images/deep/photo.png');
    });

    it('should return empty map for null or empty input', () => {
      expect(buildExtensionReplacementMap(null, '/tmp').size).to.equal(0);
      expect(buildExtensionReplacementMap(new Map(), '/tmp').size).to.equal(0);
    });

    it('should handle multiple renamed files', () => {
      const assetRootDir = '/tmp/downloads/mysite';
      const renamedFiles = new Map([
        ['/tmp/downloads/mysite/img1', '/tmp/downloads/mysite/img1.jpg'],
        ['/tmp/downloads/mysite/img2', '/tmp/downloads/mysite/img2.png'],
        ['/tmp/downloads/mysite/doc1', '/tmp/downloads/mysite/doc1.pdf'],
      ]);

      const result = buildExtensionReplacementMap(renamedFiles, assetRootDir);

      expect(result.size).to.equal(3);
      expect(result.get('/content/dam/mysite/img1')).to.equal('/content/dam/mysite/img1.jpg');
      expect(result.get('/content/dam/mysite/img2')).to.equal('/content/dam/mysite/img2.png');
      expect(result.get('/content/dam/mysite/doc1')).to.equal('/content/dam/mysite/doc1.pdf');
    });
  });
});