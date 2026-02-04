import { FileSystemUploadOptions, FileSystemUpload } from '@adobe/aem-upload';
import chalk from 'chalk';
import { uploadDirWithSplitAndFallback } from './aem-upload-orchestrator.js';

/**
 * Build the AEM Assets URL to which the assets need to be uploaded.
 *
 * @param targetUrl - The URL of the AEM Assets instance
 * @returns {string} The URL to which the assets need to be uploaded
 */
function buildAEMUrl(targetUrl) {
  let aemUrl = targetUrl;
  // Ensure the URL starts with http:// or https://
  if (!/^https?:\/\//i.test(aemUrl)) {
    aemUrl = `https://${aemUrl}`;
  }

  // Strip any trailing `/` from the aem url
  aemUrl = aemUrl.replace(/\/+$/, '');

  // Append `/content/dam`
  return new URL('/content/dam', aemUrl).toString();
}

/**
 * Build the FileSystemUploadOptions for uploading assets to AEM.
 * @param {string} target - The URL of the AEM Assets instance
 * @param {string} token - The bearer token for authentication
 * @returns {FileSystemUploadOptions}
 */
function buildFileSystemUploadOptions(target, token) {
  const maxUploadFiles = process.env.MAX_UPLOAD_FILES
    ? parseInt(process.env.MAX_UPLOAD_FILES, 10)
    : 10000;

  return new FileSystemUploadOptions()
    .withUrl(buildAEMUrl(target))
    .withConcurrent(true)
    .withMaxConcurrent(5)       // recommend 5 for stability; adjust as needed
    .withHttpRetryDelay(5000)   // default retry count = 3
    .withDeepUpload(true)       // include all descendent folders and files
    .withMaxUploadFiles(maxUploadFiles)  // key: bound per run; avoids failing on "few thousand" cases
    .withHttpOptions({
      headers: { Authorization: `Bearer ${token}` },
    })
    // If 'true', and an asset with the given name already exists, the process will delete the existing
    // asset and create a new one with the same name and the new binary.
    .withUploadFileOptions({ replace: true });
}

/**
 * Create a file uploader to upload assets. Attach event listeners to handle file upload events.
 *
 * @returns {FileSystemUpload} The file uploader
 */
/* c8 ignore start */
function createFileUploader() {
  const fileUpload = new FileSystemUpload();

  fileUpload.on('filestart', (data) => {
    const { targetFile } = data;
    console.info(chalk.yellow(`⏳ Uploading: ${targetFile}`));
  });

  fileUpload.on('fileend', (data) => {
    const { targetFile } = data;
    console.info(chalk.green(`✓ Uploaded: ${targetFile}`));
  });

  fileUpload.on('fileerror', (data) => {
    const { fileName, errors } = data;
    // errors is an array of error objects with code, message, and innerStack
    const errorMessages = Array.isArray(errors) 
      ? errors.map(err => `${err.code ? `[${err.code}] ` : ''}${err.message || 'Unknown error'}`).join(', ')
      : String(errors);
    console.error(chalk.red(`✗ Failed: ${fileName} - ${errorMessages}`));
  });

  fileUpload.on('fileuploadstart', (data) => {
    const { fileCount, directoryCount } = data;
    console.info(chalk.yellow(`Uploading: ${fileCount} file${fileCount > 1 ? 's' : ''} from ${directoryCount} directories. ${directoryCount > 0 ? 'Preparing remote folder structure, this may take some time.' : ''}`));
  });

  fileUpload.on('fileuploadend', (data) => {
    const { totalCompleted, totalFiles, totalTime } = data?.result || {};
    if (totalCompleted && totalFiles && totalTime) {
      const seconds = totalTime ? (totalTime / 1000).toFixed(2) : 'unknown';
      console.info(chalk.green(`\n🏁 Upload complete: ${totalCompleted}/${totalFiles} files in ${seconds}s`));
    }
  });

  fileUpload.on('foldercreated', (data) => {
    const { targetFolder } = data;
    console.info(chalk.green(`Created: ${targetFolder}`));
  });

  return fileUpload;
}
/* c8 ignore end */

/**
 * Upload assets to AEM.
 * @param {string} target - The URL of the AEM Assets instance
 * @param {string} token - The bearer token for authentication
 * @param {string} assetFolder - The path to the asset folder to upload the assets from
 * @param fileUploader - The file uploader to use for uploading assets (optional)
 * @return {Promise<UploadResult>} - The result of the upload operation as JSON.
 */
export async function uploadAssets(target, token, assetFolder, fileUploader = null) {
  const fileUpload = fileUploader || createFileUploader();
  const options = buildFileSystemUploadOptions(target, token);

  const urlPrefix = buildAEMUrl(target);
  const headers = { Authorization: `Bearer ${token}` };

  return await uploadDirWithSplitAndFallback({
    fileUpload,
    options,
    urlPrefix,
    headers,
    assetRootDir: assetFolder,
    dir: assetFolder,
  });
}