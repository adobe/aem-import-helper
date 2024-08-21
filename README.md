# AEM Import Helper

A helpful companion for importing your site to AEM.

### Features

- Run large [import](#import) jobs with AEM Import as a Service ([API docs](https://opensource.adobe.com/spacecat-api-service/#tag/import)).
- [Bundle](#bundle) your import scripts.

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

## Coming soon

- A report detailing the result of the import, including the reason for any failures
