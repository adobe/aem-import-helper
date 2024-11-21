 # Import Assistant
 
Run powerful AI-enabled commands to assist with your import script development.

### Options

- `--url`: The URL of the page to analyze
- `--outputPath`: The directory to save the import scripts

## Commands

### Start

Start a new import project.

##### Example:
```npm run assistant -- start --url https://example.com --outputPath tools/importer```

### Cleanup

Add elements that can be removed from the document.

#### Options:
- `--prompt`: Descriptive text to help AI understand which content to remove.

#### Example:

```npm run assistant -- cleanup --url https://example.com --prompt "All breadcrumbs and login component" --outputPath tools/importer```


### Block

Builds the transformation rules for page blocks.

#### Options:
- `--name`: The name of the block
- `--prompt`: Descriptive text to help AI understand how to create the block.

#### Example:

```npm run assistant -- block --url https://example.com --name "greenWithImageBlock" --prompt "A green box that contains an image on the left and a bold title" --outputPath tools/importer```

### Cells

Builds the cell rules for a block.

#### Options:
- `--name`: The name of the block
- `--prompt`: Descriptive text to help AI understand what content to add to a block.

#### Example:
```npm run assistant -- cells --url https://example.com --name "imageAndParagraphBlock" --prompt "The first image element and first paragraph. Place all elements in first cell of a row" --outputPath tools/importer```


### Page

Generates page transformation scripts.

#### Options:
- `--name`: The name of the page transformation
- `--prompt`: Descriptive text to help AI understand how to transform page content.

#### Example:

```npm run assistant -- page --url https://example.com --name "listTransformation" --prompt "Find the first list item element that is within a list. Move the list item outside the list it belongs to" --outputPath tools/importer```


