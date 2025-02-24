# AEM Import Helper

A helpful companion for importing your site to AEM.

### Features

- Run large [import](#import) jobs with AEM Import as a Service ([API docs](https://opensource.adobe.com/spacecat-api-service/#tag/import)).
- [Bundle](#bundle) your import scripts.
- Develop import scripts with ease using AI-assisted [commands](#assistant).
- [Import Crosswalk Content](#importing-content-into-AEM) to your AEM author.

## Install

Preferably as a dev dependency, but it can be used globally as well:

```
npm install aem-import-helper --save-dev
```

## Prerequisites For Importing

Set your environment variables (either in your shell profile or in a `.env` file):

```
export AEM_IMPORT_API_KEY=your-import-api-key
```

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"import": "aem-import-helper import"
```

## Usage
There are two types of imports, document based and AEM Authoring (xwalk) based. Please see the following sections for more information on each type.  

Both import types require a file that contains a list of all URLs to import, one per line. Create a file (named 'urls.txt') and add the URLs to this file.

### Document Based Imports

By default imports are doc based, simply provide the urls.txt file and the import.js file.

Execute the import via the following command:

```
npm run import -- --urls ./urls.txt --importjs tools/importer/import.js
```

The `import.js` file you provide will be automatically bundled and sent to the Import as a Service API, so referencing other local scripts (such as transformers) is supported.  Why are we bundling the import.js file? See the section below on [bundling multiple import scripts](#bundling-multiple-import-scripts) for more details.

Once complete, a pre-signed URL to download the import result (as a .zip archive) from S3 will be printed to the console that will contain the generated documents.


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

## AEM Authoring (Crosswalk) Imports

To perform an Crosswalk import, you will need to provide additional parameters to the invocation.  The models, filters, and definition files are 
required. You must also specify the import `type` as `xwalk` and provide the `siteName` and `assetFolder`.


```
npm run import -- \
  --urls urls.txt \
  --importjs tools/importer/import.js \
  --options '{     
    "type": "xwalk", 
    "data": { 
      "siteName": "xwalk", 
      "assetFolder": "xwalk" 
    }  
  }' \
  --models ./component-models.json \
  --filters ./component-filters.json \
  --definitions ./component-definition.json
```

Once complete, a pre-signed URL to download the import result (as a .zip archive) from S3 will be printed to the console that will contain the generated documents.

#### Importing content into AEM

Add the following npm script entries to your Edge Delivery project's `package.json`:

```
"aem-login": "aem-import-helper aem login"
"aem-upload": "aem-import-helper aem upload"
```

`aem-login`: Authenticates with your AEM Cloud Service environment.
`aem-upload`: Uploads content packages and associated assets to AEM.

#### Authenticating with AEM

Execute the following command to log in to your AEM environment:

```
npm run aem-login -- --aemurl https://author-env-url
```

At this point you will be prompted to enter your username and password. Once validated, your credentials will be securely stored in an encrypted format and used for future interactions.

You will receive the following output:
```
✔ Enter your AEM username: admin
✔ Enter your AEM password:
Validating credentials...
Saving credentials...
Login successful! Credentials saved securely.
```


#### Uploading content to AEM

Run the following command to upload content package (JCR pages) and asociated images to your AEM author:

```
npm run aem-upload
```

You’ll be prompted to provide the following details:

* Absolute Path to the Content Package: Path to the .zip file containing JCR pages, generated by the importer tool.
* Absolute Path to the Image Mapping File: Path to `image-mapping.json`, which contains mappings for image urls and their corresponding JCR paths.


The result will be similar to the following:
```
Checking for credentials...
✔ Enter the absolute path to the content package: /Users/maji/Desktop/test/xwalkdemo.zip
✔ Enter the absolute path to the image-mapping.json file: /Users/maji/Desktop/test/image-mapping.json
```

Ensure that the content and images are successfully uploaded to your AEM instance. Verify the uploaded content through your AEM Author environment.

## Bundling Multiple Import Scripts

By creating a bundled version of your import script, it makes it compatible with the Import Service as all scripts are required to be in one js file.

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"bundle": "aem-import-helper bundle"
```

Run the script:

```
npm run bundle -- --importjs tools/importer/import.js
```


## Assistant

Run AI-enabled commands to assist with your import script development.

Add an npm script entry to your Edge Delivery project's `package.json`:

```
"assistant": "aem-import-helper assistant"
```

See [Import Assistant](./docs/import-assistant.md) for usage.

