 # Import Assistant

Run powerful AI-enabled commands to assist with your import script development.

## Commands

### Start

Start a new import project.

#### Example:
```npm run assistant -- start --url https://example.com --outputPath tools/importer```

### Cleanup

Add elements that can be removed from the document.
#### Example:

```npm run assistant --cleanup --url https://example.com --prompt "content to remove" --outputPath tools/importer```


### Block

Builds the transformation rules for page blocks.
#### Example:

```npm run assistant -- block --url https://example.com --name "name of the block" --prompt "describe block content on the page" --outputPath tools/importer```

### Cells

Builds the cell rules for a block.

#### Example:
```npm run assistant -- cells --url https://example.com --name "name of the block" --prompt "describe content that should be added to the block" --outputPath tools/importer```



### Page

Generates page transformation scripts.

#### Example:

```npm run assistant -- page --url https://example.com --name "The name of the page transformation" --prompt "Prompt for the page transformation function" --outputPath tools/importer```


