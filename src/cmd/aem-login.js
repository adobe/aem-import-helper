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
import fetch from 'node-fetch';
import inquirer from 'inquirer';
import { saveCredentials } from '../utils/credential-utils.js';

// Validate credentials with AEM
async function validateLogin(url, username, password) {
    try {
        const headers = {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        };
        const response = await fetch(url, { method: "GET", headers });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Use inquirer for interactive prompts
async function getUserCredentials() {
    const answers = await inquirer.prompt([
        { name: "username", message: "Enter your AEM username:" },
        { name: "password", message: "Enter your AEM password:", type: "password" },
    ]);

    return answers;
}

export function aemLoginCommand(yargs) {
    yargs.command({
        command: 'aem-login',
        describe: 'Login to AEM Cloud Service environment',
        builder: (yargs) => {
            return yargs
                .option('aemurl', {
                    describe: 'AEM Cloud Service url to upload content to',
                    type: 'string',
                });
        },
        handler: async (argv) => {
            const credentials = await getUserCredentials();
            console.log('Validating credentials...');
            if (!validateLogin(argv.aemurl, credentials.username, credentials.password)) {
                console.log(chalk.red('Invalid credentials or AEM URL.'));
                process.exit(1);
            }

            console.log('Saving credentials...');
            saveCredentials(argv.aemurl, credentials.username, credentials.password);
            console.log(chalk.green("Login successful! Credentials saved securely."));

            process.exit(0);
        },
    });
}
