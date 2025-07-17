# AEM Import Helper

A helpful companion for importing your site to AEM.

### Features

- Run large [import](#import) jobs with AEM Import as a Service ([API docs](https://opensource.adobe.com/spacecat-api-service/#tag/import)).
- [Bundle](#bundle) your import scripts.
- [Import Crosswalk Content](#importing-content-into-AEM) to your AEM author.
- [Import DA Content](#importing-content-into-DA) to Author Bus.

## Install

Preferably as a dev dependency, but it can be used globally as well:

```
npm install @adobe/aem-import-helper --save-dev
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

To perform a Crosswalk import, you will need to provide additional parameters to the invocation.  The models, filters, and definition files are 
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

### Importing content into AEM

Add the following npm script entries to your Edge Delivery project's `package.json`:

```
"aem-upload": "aem-import-helper aem upload"
```

`aem-upload`: Uploads content packages and associated assets to AEM.

### Authenticating with AEM

To authenticate with AEM, it is suggested to obtain a development token for your AEM environment. To do this,
visit the Developer Console in your AEM author environment via Cloud Manager. For details on accessing 
the Developer Console, see the [AEM as a Cloud Service documentation](https://experienceleague.adobe.com/docs/experience-manager-cloud-service/implementing/developing/aem-as-a-cloud-service-developer-console.html?lang=en) and
[Developer Flow](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/generating-access-tokens-for-server-side-apis#generating-the-access-token) to learn how to generate an Access Token.

Once in the Developer Console:
1. Click on Integrations
2. Click on Local token
3. Click on Get Local Development Token

**NOTE: that the development token is only valid for 24 hours.**

You can store this token in a file on your local machine, or pass the token as a cli argument.
If you choose to store the token in a file, create a file and simply paste the token into the file and save it. 

```
--token </path/to/token.txt> OR <token>
```

### Uploading content to AEM

Run the following command to upload content package (JCR pages) and associated assets to your AEM author:

```
npm run aem-upload -- \
  --token token.txt \
  --zip /path/to/zip.zip \
  --asset-mapping /path/to/asset-mapping.json \
  --target https://author-p1234-e1234.adobeaemcloud.com
  --keep
  --output /path/to/download/folder
```

**Required:**
* **token**: Absolute path to the file containing the token generated from the AEM author environment, or the token value.
* **zip**: Absolute path to the content package ZIP file containing the JCR pages, generated by the importer tool.
* **target**: The target AEM author environment URL.
* **asset-mapping**: if `--skip-assets` is not provided or set to true, the asset mapping file is required to be the absolute path 
to the asset mapping file (`asset-mapping.json`), which contains mappings for asset urls and their corresponding JCR paths.

**Optional:**
* _output_ [default='aem-assets']: Absolute path to the output folder where the downloaded assets will be stored.
* _keep_ [default=false]: Keep the downloaded assets in the output folder after execution.
* _skip-assets_ [default=false]: Skip uploading assets to AEM..
* _asset-mapping_: Only optional if --skip-assets is true.

Once the command is executed, the content package and associated assets are uploaded to your AEM author environment. The content package is installed and the assets are uploaded to the DAM.

### Importing content into DA

Add the following npm script entries to your Edge Delivery project's `package.json`:

```
"da-upload": "aem-import-helper da upload"
```

`da-upload`: Uploads content packages and associated assets to DA.

### Authenticating with DA

To authenticate with DA, it is suggested to obtain a an IMS JWT bearer token for your DA environment.

You can store this token in a file on your local machine; simply create a file and simply paste the token into the file and save it.

```
--token </path/to/token.txt> OR <token>
```

### Uploading content to Author Bus

Run the following command to upload content (HTML pages) and associated assets to your DA env:

```
npm run da-upload -- \
  --token token.txt \
  --org The organization of the project.\
  --site The name of the site.\
  --asset-list /path/to/asset-list.json \
  --da-folder /path/to/html/folder
  --output /path/to/download/folder
```

**Required:**
* **org**: The organization name for your DA project. This is the first part of your DA URL path (e.g., from `https://da.live/#/geometrixx/outdoors`, the org would be `geometrixx`).
* **site**: The site name within your organization. This is the second part of your DA URL path (e.g., from `https://da.live/#/geometrixx/outdoors`, the repo would be `outdoors`).
* **da-folder**: Absolute path to the `da` folder containing the HTML pages, as generated by the importer.
* **asset-list**: Absolute path to the asset list file (`asset-list.json`), which contains list of asset urls, and the site origin info.

**Optional:**
* _token_: Absolute path to the file containing the IMS token for your DA environment, or the token value.
* _output_ [default='da-content']: Absolute path to the output folder where the DA content (pages, assets, etc.) will be stored.

Once the command is executed, the HTML pages and associated assets are uploaded to Author Bus.

## Bundling Multiple Import Scripts

By creating a bundled version of your import script, it makes it compatible with the Import Service as all scripts are required to be in one js file.

Add a npm script entry to your Edge Delivery project's `package.json`:

```
"bundle": "aem-import-helper bundle"
```

Run the script:

```
npm run bundle -- --importjs tools/importer/import.js
```


