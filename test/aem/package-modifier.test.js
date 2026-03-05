// create a test case for the package-modifier.js file that will test to see if the 
// modified zip file contains all the files that were in the original zip file.

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import {
  prepareModifiedPackage,
  buildExtensionReplacementMap,
  buildDetectedExtensionReplacementMap,
} from '../../src/aem/package-modifier.js';
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
   * Create a zip archive from a source directory.
   * @param {string} sourceDir - Directory to archive.
   * @param {string} outPath - Target zip path.
   * @returns {Promise<void>}
   */
  const zipDirectory = (sourceDir, outPath) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });

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

  it('should rewrite extensionless DAM image references in XML to detected uploaded extensions', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-mod-extless-'));
    const packageRoot = path.join(tempRoot, 'package');
    const assetRootDir = path.join(tempRoot, 'assets', 'test-site');
    const xmlDir = path.join(packageRoot, 'jcr_root', 'content', 'demo', 'en');
    const imageDir = path.join(assetRootDir, 'is', 'image', 'test-corp');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.mkdirSync(imageDir, { recursive: true });

    const xmlPath = path.join(xmlDir, '.content.xml');
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="cq:Page">
  <jcr:content jcr:primaryType="cq:PageContent"
    image1="/content/dam/test-site/is/image/test-corp/woman-in-lab-looking-down"
    image2="/content/dam/test-site/is/image/test-corp/ambily-card-image"
    image3="/content/dam/test-site/is/image/test-corp/kids-playing-soccer-grass"
    image4="/content/dam/test-site/is/image/test-corp/wp-card-story-image"
    image5="/content/dam/test-site/is/image/test-corp/wp-sponsorship-hero"
    image6="/content/dam/test-site/is/image/test-corp/sitting-in-hammock-by-lake-hero"/>
</jcr:root>`;
    fs.writeFileSync(xmlPath, xmlContent, 'utf8');
    fs.writeFileSync(path.join(imageDir, 'woman-in-lab-looking-down.jpg'), 'x', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'wp-card-story-image.png'), 'x', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'wp-sponsorship-hero.png'), 'x', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'ambily-card-image.jpg'), 'x', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'kids-playing-soccer-grass.png'), 'x', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'sitting-in-hammock-by-lake-hero.png'), 'x', 'utf8');

    const inputZip = path.join(tempRoot, 'input.zip');
    await zipDirectory(packageRoot, inputZip);

    const scene7AssetMap = new Map([
      ['https://test-corp.scene7.com/is/image/test-corp/woman-in-lab-looking-down?fmt=webp', '/content/dam/test-site/is/image/test-corp/woman-in-lab-looking-down'],
      ['https://test-corp.scene7.com/is/image/test-corp/wp-card-story-image?$Square$', '/content/dam/test-site/is/image/test-corp/wp-card-story-image'],
      ['https://test-corp.scene7.com/is/image/test-corp/wp-sponsorship-hero?$Hero$', '/content/dam/test-site/is/image/test-corp/wp-sponsorship-hero'],
      ['https://test-corp.scene7.com/is/image/test-corp/ambily-card-image?fmt=webp', '/content/dam/test-site/is/image/test-corp/ambily-card-image'],
      ['https://test-corp.scene7.com/is/image/test-corp/kids-playing-soccer-grass?fmt=webp', '/content/dam/test-site/is/image/test-corp/kids-playing-soccer-grass'],
      ['https://test-corp.scene7.com/is/image/test-corp/sitting-in-hammock-by-lake-hero?fmt=webp', '/content/dam/test-site/is/image/test-corp/sitting-in-hammock-by-lake-hero'],
    ]);

    const extensionReplacements = buildDetectedExtensionReplacementMap(scene7AssetMap, assetRootDir);
    const { modifiedZipPath } = await prepareModifiedPackage(inputZip, scene7AssetMap, false, extensionReplacements);

    const unzipOut = path.join(tempRoot, 'out');
    await extractZipFiles([[modifiedZipPath, unzipOut]]);
    const updatedXmlPath = path.join(unzipOut, 'jcr_root', 'content', 'demo', 'en', '.content.xml');
    const updatedXml = fs.readFileSync(updatedXmlPath, 'utf8');

    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/woman-in-lab-looking-down.jpg');
    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/wp-card-story-image.png');
    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/wp-sponsorship-hero.png');
    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/ambily-card-image.jpg');
    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/kids-playing-soccer-grass.png');
    expect(updatedXml).to.contain('/content/dam/test-site/is/image/test-corp/sitting-in-hammock-by-lake-hero.png');
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

  describe('buildDetectedExtensionReplacementMap', () => {
    it('should detect on-disk extensions for extensionless JCR references', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-mod-detect-'));
      const assetRootDir = path.join(tempRoot, 'test-site');
      const imageDir = path.join(assetRootDir, 'is', 'image', 'test-corp');
      fs.mkdirSync(imageDir, { recursive: true });

      fs.writeFileSync(path.join(imageDir, 'hero.png'), 'x', 'utf8');
      fs.writeFileSync(path.join(imageDir, 'card.jpg'), 'x', 'utf8');

      const assetMapForDetection = new Map([
        ['https://example.com/hero?fmt=webp', '/content/dam/test-site/is/image/test-corp/hero'],
        ['https://example.com/card', '/content/dam/test-site/is/image/test-corp/card'],
      ]);

      const result = buildDetectedExtensionReplacementMap(assetMapForDetection, assetRootDir);

      expect(result.size).to.equal(2);
      expect(result.get('/content/dam/test-site/is/image/test-corp/hero'))
        .to.equal('/content/dam/test-site/is/image/test-corp/hero.png');
      expect(result.get('/content/dam/test-site/is/image/test-corp/card'))
        .to.equal('/content/dam/test-site/is/image/test-corp/card.jpg');
    });
  });
});
