

import { expect, use } from 'chai';
import { writeManifestFiles } from '../../src/assistant/assistant-helper.js';
import { writeToFile } from '../../src/utils/fileUtils.js';
import { helperEvents } from '../../src/events.js';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

use(chaiAsPromised);

describe('writeManifestFiles', () => {
    let writeToFileStub;
    let emitStub;

    beforeEach(() => {
        writeToFileStub = sinon.stub(writeToFile);
        emitStub = sinon.stub(helperEvents, 'emit');
    });

    afterEach(() => {
        // Restore original functionality
        sinon.restore();
    });

    it('writes files with valid contents', async () => {
        const manifest = {
            files: [
                { name: 'file1.txt', contents: 'Hello, World!' },
                { name: 'file2.txt', contents: 'Sample Content' },
            ],
        };
        const outputPath = '/output/';

        // Stub writeToFile to simulate successful writes
        writeToFileStub.resolves();

        await writeManifestFiles(manifest, outputPath);

        expect(writeToFileStub.calledTwice).to.be.true;
        expect(writeToFileStub.firstCall.calledWith('./output/file1.txt', 'Hello, World!')).to.be.true;
        expect(writeToFileStub.secondCall.calledWith('./output/file2.txt', 'Sample Content')).to.be.true;

        expect(emitStub.calledWith('start', 'File file1.txt was written to /output/')).to.be.true;
        expect(emitStub.calledWith('start', 'File file2.txt was written to /output/')).to.be.true;
        expect(emitStub.callCount).to.equal(4); // 2 'start' + 2 'complete'
    });

    it('skips files with missing contents', async () => {
        const manifest = {
            files: [
                { name: 'file1.txt', contents: 'Valid Content' },
                { name: 'file2.txt', contents: null },
            ],
        };
        const outputPath = '/output/';

        writeToFileStub.resolves();

        await writeManifestFiles(manifest, outputPath);

        expect(writeToFileStub.calledOnce).to.be.true;
        expect(writeToFileStub.calledWith('./output/file1.txt', 'Valid Content')).to.be.true;

        expect(emitStub.calledWith('start', 'File file1.txt was written to /output/')).to.be.true;
        expect(emitStub.calledWith('start', 'File file2.txt was skipped due to missing content')).to.be.true;
        expect(emitStub.callCount).to.equal(3); // 2 'start' + 1 'complete'
    });

    it('handles an empty manifest file list', async () => {
        const manifest = { files: [] };
        const outputPath = '/output/';

        await writeManifestFiles(manifest, outputPath);

        expect(writeToFileStub.notCalled).to.be.true;
        expect(emitStub.notCalled).to.be.true;
    });

    it('handles no files property in manifest', async () => {
        const manifest = {};
        const outputPath = '/output/';

        await writeManifestFiles(manifest, outputPath);

        expect(writeToFileStub.notCalled).to.be.true;
        expect(emitStub.notCalled).to.be.true;
    });
});
