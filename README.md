# AEM Import Helper

Helper tool for running large import jobs with AEM Import as a Service.

## Usage

Create a file (named `urls.txt` below) which contains a list of all URLs to import, one per line. 

Set your environment variables:

```
export SPACECAT_API_KEY=your-api-key
export IMPORT_API_KEY=your-import-api-key
```

Then, run the script:

```
node import-helper.js --urls urls.txt
```

## Coming soon

- Custom import.js support.
