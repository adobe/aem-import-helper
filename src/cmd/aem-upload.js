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

import chalk from 'chalk';
import fs from 'fs';
import inquirer from 'inquirer';
import uploadPackageToAEM from '../aem-uploader/package/upload-package-to-aem.js';
import uploadImagesToAEM from '../aem-uploader/images/upload-images-to-aem.js';
import { loadCredentials } from '../utils/credential-utils.js';

// Validate the files
async function validateFiles(jcrImageMappingFile, contentPackagePath) {
    if (!contentPackagePath || !jcrImageMappingFile) {
        return false;
    }

    if (!fs.existsSync(contentPackagePath)) {
        console.error(`Content package not found: ${contentPackagePath}`);
        return false;
    }

    if (!fs.existsSync(jcrImageMappingFile)) {
        console.error(`jcr-image-mappings.json file not found: ${jcrImageMappingFile}`);
        return false;
    }
    return true;
}

// Use inquirer for interactive prompts
async function getPathInputs() {
    const answers = await inquirer.prompt([
        { name: "contentPackagePath", message: "Enter the absolute path to the content package:" },
        { name: "jcrImageMappingFile", message: "Enter the absolute path to the jcr-image-mappings.json file:" },
        { name: "siteName", message: "Enter the site name:" },
    ]);

    return answers;
}

export function aemUploadCommand(yargs) {
    yargs.command({
        command: 'aem-upload',
        describe: 'Upload the content to AEM Cloud Service environment',
        builder: (yargs) => {
            return yargs;
        },
        handler: async () => {
            console.log("Checking for credentials...");
            const credentials = loadCredentials();
            if (!credentials) {
                console.log(chalk.red('No credentials found. Run `aem-login` first.'));
                process.exit(1);
            }

            const pathInputs = await getPathInputs();

            console.log("Checking for files...");

            if (!validateFiles(pathInputs.jcrImageMappingFile, pathInputs.contentPackagePath) || !pathInputs.siteName) {
                console.log(chalk.green('Invalid file paths provided.'));
                process.exit(1);
            }

            const opts = {
                username: credentials.username,
                password: credentials.password,
                targetAEMUrl: credentials.url,
                baseAssetFolderName: pathInputs.siteName,
                maxRetries: 3
            };

            // Process the upload request
            uploadImagesToAEM(opts, pathInputs.jcrImageMappingFile)
                .then(() => uploadPackageToAEM(opts, pathInputs.contentPackagePath))
                .then(() => console.log(chalk.green('Upload completed successfully')))
                .then(() => process.exit(0))
                .catch(err => {
                    console.error(chalk.red('Error during upload:', err.message));
                    process.exit(1);
                });
        },
    });
}
