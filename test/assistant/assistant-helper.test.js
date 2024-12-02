
import { expect, use } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import sinonChai from 'sinon-chai';

use(sinonChai);

describe('Assistant Helper tests', () => {
  let assistantModule;
  let getBuilderStub;
  let buildProjectStub;
  let addCleanupStub;
  let addBlockStub;
  let addCellParserStub;
  let addPageTransformerStub;

  let writeToFileStub;
  let consoleLogStub;

  const testBuilderManifest = { files: [{ name: './testFile.js', contents: 'test content' }] };

  beforeEach(async () => {
    getBuilderStub = sinon.stub().resolves({
      buildProject: buildProjectStub = sinon.stub().resolves(testBuilderManifest),
      addCleanup: addCleanupStub = sinon.stub().resolves(testBuilderManifest),
      addBlock: addBlockStub = sinon.stub().resolves(testBuilderManifest),
      addCellParser: addCellParserStub = sinon.stub().resolves(testBuilderManifest),
      addPageTransformer: addPageTransformerStub = sinon.stub().resolves(testBuilderManifest),
    });
    writeToFileStub = sinon.stub().resolves();
    consoleLogStub = sinon.stub(console, 'log');

    assistantModule = await esmock('../../src/assistant/assistant-helper.js', {
      '../../src/assistant/assistant-builder.js': { default: getBuilderStub },
      '../../src/utils/fileUtils.js': { writeToFile: writeToFileStub },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('assistant sequence tests', () => {
    const url = 'http://example.com';
    const outputPath = '/output/path';
    const stage = false;

    afterEach(() => {
      sinon.restore();
    });

    it('should run the start assistant and log success message', async () => {
      await assistantModule.runStartAssistant({ url, outputPath, stage });

      expect(getBuilderStub).to.be.calledOnceWith(url, { outputPath, stage });
      expect(buildProjectStub).to.be.calledOnce;
      expect(writeToFileStub).to.be.called;
      sinon.assert.calledWith(consoleLogStub, sinon.match('Import scripts generated successfully'));
    });

    it('should run the removal assistant and log success message', async () => {
      await assistantModule.runRemovalAssistant({ url, outputPath, stage, prompt: 'test-prompt' });

      expect(getBuilderStub).to.be.calledOnceWith(url, { outputPath, stage, useExisting: true });
      expect(addCleanupStub).to.be.calledOnceWith('test-prompt');
      expect(writeToFileStub).to.be.called;
      sinon.assert.calledWith(consoleLogStub, sinon.match('Removal script generated successfully'));
    });

    it('should run the block assistant and log success message', async () => {
      await assistantModule.runBlockAssistant({ url, outputPath, stage, name: 'test-block', prompt: 'test-prompt' });

      expect(getBuilderStub).to.be.calledOnceWith(url, { outputPath, stage, useExisting: true });
      expect(addBlockStub).to.be.calledOnceWith('test-block', 'test-prompt');
      expect(writeToFileStub).to.be.called;
      sinon.assert.calledWith(consoleLogStub, sinon.match('Block scripts generated successfully'));
    });

    it('should run the cells assistant and log success message', async () => {
      await assistantModule.runCellAssistant({ url, outputPath, stage, name: 'test-block', prompt: 'test-prompt' });

      expect(getBuilderStub).to.be.calledOnceWith(url, { outputPath, stage, useExisting: true });
      expect(addCellParserStub).to.be.calledOnceWith('test-block', 'test-prompt');
      expect(writeToFileStub).to.be.called;
      sinon.assert.calledWith(consoleLogStub, sinon.match('test-block block parser generated successfully'));
    });

    it('should run the page assistant and log success message', async () => {
      await assistantModule.runPageAssistant({ url, outputPath, stage, name: 'test-transformer', prompt: 'test-prompt' });

      expect(getBuilderStub).to.be.calledOnceWith(url, { outputPath, stage, useExisting: true });
      expect(addPageTransformerStub).to.be.calledOnceWith('test-transformer', 'test-prompt');
      expect(writeToFileStub).to.be.called;
      sinon.assert.calledWith(consoleLogStub, sinon.match('test-transformer page transformation generated successfully'));
    });
  });

  describe('writeManifestFiles tests', () => {
    it('with no valid files', async () => {
      const url = 'http://example.com';
      const outputPath = '/output/path';
      const stage = false;

      getBuilderStub = sinon.stub().resolves({
        buildProject: buildProjectStub = sinon.stub().resolves({ files: [] }),
      });

      assistantModule = await esmock('../../src/assistant/assistant-helper.js', {
        '../../src/assistant/assistant-builder.js': { default: getBuilderStub },
        '../../src/utils/fileUtils.js': { writeToFile: writeToFileStub },
      });

      await assistantModule.runStartAssistant({ url, outputPath, stage });

      expect(writeToFileStub).to.not.be.called;
    });
    it('with one valid file', async () => {
      const url = 'http://example.com';
      const outputPath = '/output/path';
      const stage = false;

      getBuilderStub = sinon.stub().resolves({
        buildProject: buildProjectStub = sinon.stub().resolves({ files: [{ name: 'test.js', contents: 'test content' }] }),
      });

      assistantModule = await esmock('../../src/assistant/assistant-helper.js', {
        '../../src/assistant/assistant-builder.js': { default: getBuilderStub },
        '../../src/utils/fileUtils.js': { writeToFile: writeToFileStub },
      });

      await assistantModule.runStartAssistant({ url, outputPath, stage });

      expect(writeToFileStub).to.be.callCount(1);
    });
    it('with multiple valid files', async () => {
      const url = 'http://example.com';
      const outputPath = '/output/path';
      const stage = false;

      getBuilderStub = sinon.stub().resolves({
        buildProject: buildProjectStub = sinon.stub().resolves({ files: [
          { name: 'test1.js', contents: 'test content' },
          { name: 'test2.js', contents: 'test content' },
        ] }),
      });

      assistantModule = await esmock('../../src/assistant/assistant-helper.js', {
        '../../src/assistant/assistant-builder.js': { default: getBuilderStub },
        '../../src/utils/fileUtils.js': { writeToFile: writeToFileStub },
      });

      await assistantModule.runStartAssistant({ url, outputPath, stage });

      expect(writeToFileStub).to.be.callCount(2);
    });
    it('with some invalid files', async () => {
      const url = 'http://example.com';
      const outputPath = '/output/path';
      const stage = false;

      getBuilderStub = sinon.stub().resolves({
        buildProject: buildProjectStub = sinon.stub().resolves({ files: [
          { name: 'test1.js', contents: 'test content' },
          { name: 'test2.js', contents: '' },
        ] }),
      });

      assistantModule = await esmock('../../src/assistant/assistant-helper.js', {
        '../../src/assistant/assistant-builder.js': { default: getBuilderStub },
        '../../src/utils/fileUtils.js': { writeToFile: writeToFileStub },
      });

      await assistantModule.runStartAssistant({ url, outputPath, stage });

      expect(writeToFileStub).to.be.callCount(1);
    });
  });

});
