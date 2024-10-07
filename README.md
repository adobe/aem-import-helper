# AEM Import Helper

A helpful companion for importing your site to AEM.

### Features

- Run large [import](#import) jobs with AEM Import as a Service ([API docs](https://opensource.adobe.com/spacecat-api-service/#tag/import)).
- [Bundle](#bundle) your import scripts.
- Develop import scripts with ease using AI-assisted [commands](#assistant).

## Install

Preferably as a dev dependency, but it can be used globally as well:

```
npm install aem-import-helper --save-dev
```

## Usage

### Import

Create a file (named `urls.txt` below) which contains a list of all URLs to import, one per line. 

Set your environment variables (either in your shell profile or in a `.env` file):

```
export AEM_IMPORT_API_KEY=your-import-api-key
```

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"import": "aem-import-helper import"
```

Run the script:

```
npm run import -- --urls tools/importer/urls.txt --importjs tools/importer/import.js
```

The `import.js` file you provide will be automatically bundled and sent to the Import as a Service API, so referencing
other local scripts (such as transformers) is supported.

Once complete, a pre-signed URL to download the import result (as a .zip archive) from S3 will be printed to the console.

#### SharePoint upload

Optionally, the [m365 CLI](https://pnp.github.io/cli-microsoft365/) can be installed and configured to upload the import result to SharePoint.
You will need your `tenantId` and the `clientId` of a [Microsoft Entra application](https://pnp.github.io/cli-microsoft365/user-guide/using-own-identity/) (on your SharePoint) to setup the CLI:

```
m365 setup
m365 login
```

Copy a link from SharePoint to the directory you'd like to upload to. This can be done from the SharePoint web UI, via the "Copy link" button.
Your new link should take the following form: `https://example.sharepoint.com/:f:/r/sites/example/Shared%20Documents/destination-directory`

Once logged in to SharePoint with the `m365` CLI, pass the SharePoint link as a param to the aem-import-helper:

```
npm run import -- --urls urls.txt --sharepointurl https://example.sharepoint.com/:f:/r/sites/example/Shared%20Documents/destination-directory
```

Once the import job is complete, the import result will be downloaded from S3, extracted, and each document will be uploaded to the specified SharePoint directory.

### Bundle

Create a bundled version of your import script that is compatible with the Import Service.

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"bundle": "aem-import-helper bundle"
```

Run the script:

```
npm run bundle -- --importjs tools/importer/import.js
```

The `import.js` file you provide will be bundled with any locally referenced scripts and saved to a new file named `import.bundle.js`.

### Assistant

Run AI-enabled commands to assist with your import script development.

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"assistant": "aem-import-helper assistant"
```

Run the script:

```
npm run assistant -- start --url https://example.com --outputPath tools/importer
npm run assistant -- cleanup --url https://example.com --prompt "content to remove"
npm run assistant -- block --url https://example.com --name "name of the block" --prompt "describe block content on the page"
npm run assistant -- cells --url https://example.com --name "name of the block" --prompt "describe content that should be added to the block"
```

#### Commands

- `start`: Start a new import project
- `cleanup`: Remove content from the page
- `block`: Define a block on the page
- `cells`: Add content to a block

#### Options

- `--url`: The URL of the page to analyze
- `--outputPath`: The directory to save the import scripts
- `--name`: The name of the block
- `--prompt`: Descriptive text to help understand the content

#### Authentication



## Coming soon

- A report detailing the result of the import, including the reason for any failures
