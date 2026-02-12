## [1.4.1](https://github.com/adobe/aem-import-helper/compare/v1.4.0...v1.4.1) (2026-02-12)


### Bug Fixes

* da - handle multiple dot file names and jsdom unwrapping ([#83](https://github.com/adobe/aem-import-helper/issues/83)) ([a81db96](https://github.com/adobe/aem-import-helper/commit/a81db96de3d70657b5a50cbedf9af11a7b46ed09))

# [1.4.0](https://github.com/adobe/aem-import-helper/compare/v1.3.4...v1.4.0) (2026-02-04)


### Features

* provide more robust uploading for aem with deeply nested folders ([#82](https://github.com/adobe/aem-import-helper/issues/82)) ([42099b8](https://github.com/adobe/aem-import-helper/commit/42099b82d4c677ff1edef00be63182e9f4e32d46))

## [1.3.4](https://github.com/adobe/aem-import-helper/compare/v1.3.3...v1.3.4) (2026-01-30)


### Bug Fixes

* wrap da html if not valid html for da ([#81](https://github.com/adobe/aem-import-helper/issues/81)) ([84fb746](https://github.com/adobe/aem-import-helper/commit/84fb74618e20a3f8b0f1310b40d6a3bb8a252348)), closes [#80](https://github.com/adobe/aem-import-helper/issues/80)

## [1.3.3](https://github.com/adobe/aem-import-helper/compare/v1.3.2...v1.3.3) (2026-01-13)


### Bug Fixes

* widen Node.js and npm engine requirements ([#76](https://github.com/adobe/aem-import-helper/issues/76)) ([f581475](https://github.com/adobe/aem-import-helper/commit/f581475f2cfff1c5aab70a9463204ac2278060f8))

## [1.3.2](https://github.com/adobe/aem-import-helper/compare/v1.3.1...v1.3.2) (2025-11-14)


### Bug Fixes

* DA upload should rewrite asset references to PNG when images-to-png is enabled ([#75](https://github.com/adobe/aem-import-helper/issues/75)) ([30dc18e](https://github.com/adobe/aem-import-helper/commit/30dc18e5ed81474b1762b71cb9f371023b02669b))

## [1.3.1](https://github.com/adobe/aem-import-helper/compare/v1.3.0...v1.3.1) (2025-11-13)


### Bug Fixes

* Add image conversion option to png in local asset processing ([#73](https://github.com/adobe/aem-import-helper/issues/73)) ([c8acb36](https://github.com/adobe/aem-import-helper/commit/c8acb36ff112359a6bcd29788a1ba13449796c49))

# [1.3.0](https://github.com/adobe/aem-import-helper/compare/v1.2.3...v1.3.0) (2025-11-03)


### Features

* Allow users to provide assets from local filesystem for DA upload ([#70](https://github.com/adobe/aem-import-helper/issues/70)) ([4ec0537](https://github.com/adobe/aem-import-helper/commit/4ec0537ec9ac1659e18c324570c32e82b5e24172))

## [1.2.3](https://github.com/adobe/aem-import-helper/compare/v1.2.2...v1.2.3) (2025-10-17)


### Bug Fixes

* Add changes to fix the duplicate image issue ([d240f45](https://github.com/adobe/aem-import-helper/commit/d240f4544a19c1c08fc275ff3b86a398b25adeae))
* Add unit test changes ([5b4f4ce](https://github.com/adobe/aem-import-helper/commit/5b4f4ce61f1b2e18024b8dac7c31821597dad6bf))
* Prevent filename collisions ([d5767e0](https://github.com/adobe/aem-import-helper/commit/d5767e061c574d5e6fbbfecdd656e6c82c62dbef))
* Remove additional space ([fd5ad23](https://github.com/adobe/aem-import-helper/commit/fd5ad23da59292f97a285e8c6cab0ecf273f48f8))

## [1.2.2](https://github.com/adobe/aem-import-helper/compare/v1.2.1...v1.2.2) (2025-09-25)


### Bug Fixes

* unzipping is not extracting all files ([#66](https://github.com/adobe/aem-import-helper/issues/66)) ([5da3042](https://github.com/adobe/aem-import-helper/commit/5da3042dd5a2fb51f215f85a4c9decdb9cc23baa)), closes [#65](https://github.com/adobe/aem-import-helper/issues/65)

## [1.2.1](https://github.com/adobe/aem-import-helper/compare/v1.2.0...v1.2.1) (2025-09-22)


### Bug Fixes

* [DA][Regression] Add back processing for non-html files ([#63](https://github.com/adobe/aem-import-helper/issues/63)) ([76e2723](https://github.com/adobe/aem-import-helper/commit/76e27237fa2107d1ffd4ca382cdc59fb41e57934))

# [1.2.0](https://github.com/adobe/aem-import-helper/compare/v1.1.11...v1.2.0) (2025-09-18)


### Features

* store non-image assets in shared-media folders under parent directories ([#58](https://github.com/adobe/aem-import-helper/issues/58)) ([eeee3f6](https://github.com/adobe/aem-import-helper/commit/eeee3f606e7a4849ce92c2c97cd64bc9a627b3d5))

## [1.1.11](https://github.com/adobe/aem-import-helper/compare/v1.1.10...v1.1.11) (2025-08-26)


### Bug Fixes

* [DA] sanitise asset file name before adding to DA  ([#55](https://github.com/adobe/aem-import-helper/issues/55)) ([605738d](https://github.com/adobe/aem-import-helper/commit/605738d8d9af63c31f22ffbae2f00c2ad9d78c63))

## [1.1.10](https://github.com/adobe/aem-import-helper/compare/v1.1.9...v1.1.10) (2025-08-22)


### Bug Fixes

* [DA] Do not modify mailto links ([#54](https://github.com/adobe/aem-import-helper/issues/54)) ([c7e0a98](https://github.com/adobe/aem-import-helper/commit/c7e0a98d8d1164c5e302c0889e348e79c1b76744))

## [1.1.9](https://github.com/adobe/aem-import-helper/compare/v1.1.8...v1.1.9) (2025-08-22)


### Bug Fixes

* lint fixes ([#52](https://github.com/adobe/aem-import-helper/issues/52)) ([ee6f662](https://github.com/adobe/aem-import-helper/commit/ee6f662704a897046307b1c7bd1e2b36789dd157))
* sanitised document paths. ([#50](https://github.com/adobe/aem-import-helper/issues/50)) ([b4345bc](https://github.com/adobe/aem-import-helper/commit/b4345bcbac3259b8a9339eadc3b73231604228a1))

## [1.1.8](https://github.com/adobe/aem-import-helper/compare/v1.1.7...v1.1.8) (2025-08-19)


### Bug Fixes

* [DA] PageReferences In HTML not updated when no assets on page ([#48](https://github.com/adobe/aem-import-helper/issues/48)) ([f8294c6](https://github.com/adobe/aem-import-helper/commit/f8294c6593f7b18d3e24d2e20ecb9c4ccce7462f))

## [1.1.7](https://github.com/adobe/aem-import-helper/compare/v1.1.6...v1.1.7) (2025-08-18)


### Bug Fixes

* use relative path for Page References in HTML ([9f5e489](https://github.com/adobe/aem-import-helper/commit/9f5e48946b83f6b0711402c9cf2669096346d415))

## [1.1.6](https://github.com/adobe/aem-import-helper/compare/v1.1.5...v1.1.6) (2025-08-13)


### Bug Fixes

* Remove unnecessary logging ([#35](https://github.com/adobe/aem-import-helper/issues/35)) ([ed30939](https://github.com/adobe/aem-import-helper/commit/ed309391f22311a0a70cc11391f5312e9894b491))

## [1.1.5](https://github.com/adobe/aem-import-helper/compare/v1.1.4...v1.1.5) (2025-08-12)


### Bug Fixes

* da provide a keep flag to keep assets locally ([#43](https://github.com/adobe/aem-import-helper/issues/43)) ([5a7f362](https://github.com/adobe/aem-import-helper/commit/5a7f362a16e13b9d82154b546b9f0d452735c274)), closes [#42](https://github.com/adobe/aem-import-helper/issues/42)

## [1.1.4](https://github.com/adobe/aem-import-helper/compare/v1.1.3...v1.1.4) (2025-08-11)


### Bug Fixes

* support converting webp, avif image types to png ([#41](https://github.com/adobe/aem-import-helper/issues/41)) ([000b718](https://github.com/adobe/aem-import-helper/commit/000b7187d94d8a5e8acde1a4dc889dc7366fe016))

## [1.1.3](https://github.com/adobe/aem-import-helper/compare/v1.1.2...v1.1.3) (2025-08-03)


### Bug Fixes

* Add browser-like headers to asset downloads to handle browser fingerprinting ([#39](https://github.com/adobe/aem-import-helper/issues/39)) ([b72bad9](https://github.com/adobe/aem-import-helper/commit/b72bad9e06e3e18a943266dec19414070c044681))

## [1.1.2](https://github.com/adobe/aem-import-helper/compare/v1.1.1...v1.1.2) (2025-07-31)


### Bug Fixes

* da-upload should also be able to handle non-html files too ([#36](https://github.com/adobe/aem-import-helper/issues/36)) ([228c0c7](https://github.com/adobe/aem-import-helper/commit/228c0c7ea5c2b4026976a2188c3373fd183dd26d))

## [1.1.1](https://github.com/adobe/aem-import-helper/compare/v1.1.0...v1.1.1) (2025-07-22)


### Bug Fixes

* Parallelisation in DA asset upload ([#33](https://github.com/adobe/aem-import-helper/issues/33)) ([0ed1e34](https://github.com/adobe/aem-import-helper/commit/0ed1e34db7b36ecadbb3c0662bbc1f1434ef0ea1))

# [1.1.0](https://github.com/adobe/aem-import-helper/compare/v1.0.6...v1.1.0) (2025-07-21)


### Features

* Add support for Document Authoring HTML and asset upload ([#32](https://github.com/adobe/aem-import-helper/issues/32)) ([105fc30](https://github.com/adobe/aem-import-helper/commit/105fc30349376425177509e2bf952d0d65e8d3d9))

## [1.0.6](https://github.com/adobe/aem-import-helper/compare/v1.0.5...v1.0.6) (2025-06-12)


### Bug Fixes

* **sites-31153:** [Xwalk] Use mime type from content-type header for assets with no extension ([#29](https://github.com/adobe/aem-import-helper/issues/29)) ([bebf50a](https://github.com/adobe/aem-import-helper/commit/bebf50a6953926c95e28b82d4d3e567a1587d7fc))

## [1.0.5](https://github.com/adobe/aem-import-helper/compare/v1.0.4...v1.0.5) (2025-04-23)


### Bug Fixes

* force override ([3df35bd](https://github.com/adobe/aem-import-helper/commit/3df35bd062ed6a0b294dc89ad1f724d479d4110e))

## [1.0.4](https://github.com/adobe/aem-import-helper/compare/v1.0.3...v1.0.4) (2025-04-23)


### Bug Fixes

* remove the verbose logging when uploading assets ([3eff81a](https://github.com/adobe/aem-import-helper/commit/3eff81a08acbfa35f892b184e8b10faf3edded37))

## [1.0.3](https://github.com/adobe/aem-import-helper/compare/v1.0.2...v1.0.3) (2025-03-26)


### Bug Fixes

* **sites-29591:** [xwalk] - logging is too verbose when uploading assets ([#27](https://github.com/adobe/aem-import-helper/issues/27)) ([ad13da2](https://github.com/adobe/aem-import-helper/commit/ad13da22b579f226dd51bf0a052146a10f1dab03))

## [1.0.2](https://github.com/adobe/aem-import-helper/compare/v1.0.1...v1.0.2) (2025-03-18)


### Bug Fixes

* provide the option to skip image dl/up ([#26](https://github.com/adobe/aem-import-helper/issues/26)) ([a3219d3](https://github.com/adobe/aem-import-helper/commit/a3219d308c652f868273bcdd0f11bd6efc464f44))

## [1.0.1](https://github.com/adobe/aem-import-helper/compare/v1.0.0...v1.0.1) (2025-03-12)


### Bug Fixes

* **release:** release aem-import-helper under the adobe namespace ([b6b53e2](https://github.com/adobe/aem-import-helper/commit/b6b53e299af399dc6fb11700152fdf9eddea70c3))

# 1.0.0 (2025-03-11)


### Bug Fixes

* Add unit test coverage ([#6](https://github.com/adobe/aem-import-helper/issues/6)) ([16b6146](https://github.com/adobe/aem-import-helper/commit/16b6146e46ab3783ddf031b2868283ca5f4912be))
* Figure out asset folder name from jcr image path ([#15](https://github.com/adobe/aem-import-helper/issues/15)) ([461292c](https://github.com/adobe/aem-import-helper/commit/461292cdbc6c36dac2a2e63af6c6f2134a47c754))
* **sites-29589:** [Xwalk] aem-import-helper should take zip file and image mapping as args ([#20](https://github.com/adobe/aem-import-helper/issues/20)) ([2c1c615](https://github.com/adobe/aem-import-helper/commit/2c1c6157ed773af55897599d239499df458d1ef7))
* **sites-29590:** support user bearer token ([#22](https://github.com/adobe/aem-import-helper/issues/22)) ([4d190b1](https://github.com/adobe/aem-import-helper/commit/4d190b1260dc81315e6537707f075a909f17db43))


### Features

* [Import Assistant] Page transformations ([#4](https://github.com/adobe/aem-import-helper/issues/4)) ([bfacdb0](https://github.com/adobe/aem-import-helper/commit/bfacdb0fe1f18c764f5b490e24dfd6245e9b13f8))
* Implement standalone upload command ([72fd15d](https://github.com/adobe/aem-import-helper/commit/72fd15dad79cd8e4757cfdbf8c400ef2acf318a7))
* Import Assistant ([#7](https://github.com/adobe/aem-import-helper/issues/7)) ([05e2082](https://github.com/adobe/aem-import-helper/commit/05e20828207665fd7db74299d31392fedf95ad20))
* Initial implementation of SharePoint upload ([00eb93a](https://github.com/adobe/aem-import-helper/commit/00eb93afb41f061d755f91d503d4759e5aa1ee44))
* Initial implementation of SharePoint upload ([6cfc248](https://github.com/adobe/aem-import-helper/commit/6cfc248da1d9648712ca305a9367477fa4020db6))
* Initial implementation of SharePoint upload ([927d7eb](https://github.com/adobe/aem-import-helper/commit/927d7ebbf720c350aa3464bb6561ef5bacaecbcd))
* Initial implementation of SharePoint upload ([cc5a4b1](https://github.com/adobe/aem-import-helper/commit/cc5a4b15666cde54a870bd1feb01c369bf9535ed))
* Show UI URL when job was created ([#13](https://github.com/adobe/aem-import-helper/issues/13)) ([04db418](https://github.com/adobe/aem-import-helper/commit/04db41864b551ea88778882b32afcc1ba52c539b))
* SITES-27041 [Import Assistant] Remove system prompts from import builder ([#9](https://github.com/adobe/aem-import-helper/issues/9)) ([978a68d](https://github.com/adobe/aem-import-helper/commit/978a68d8c314f75f4fc46a8fba1be672f43bd326))
* **sites-29400:** integrate xwalk support into aem-import-helper ([#17](https://github.com/adobe/aem-import-helper/issues/17)) ([e4e3afd](https://github.com/adobe/aem-import-helper/commit/e4e3afd0fe42170c0492d4e1a099c95426b81d00))
* **sites-29416:** [Xwalk] Add support for importing non-image assets ([#19](https://github.com/adobe/aem-import-helper/issues/19)) ([3c6c87d](https://github.com/adobe/aem-import-helper/commit/3c6c87d4d8bc2a750b69b5544b4efa6731b40c75))
* SITES-29655 Remove import assistant related code from the helper ([823c56a](https://github.com/adobe/aem-import-helper/commit/823c56a742df981f91a46ee6849a0199eedfe83e))
* SITES-29655 Remove import assistant related code from the helper ([c3caac0](https://github.com/adobe/aem-import-helper/commit/c3caac0baf548fc32e90b56e434252b706be4cad))
* SITES-29655 Remove import assistant related code from the helper ([7f262e1](https://github.com/adobe/aem-import-helper/commit/7f262e1b4cb37027e8e071fa0cf4033b4a2186a4))
* Upload content to AEM ([#11](https://github.com/adobe/aem-import-helper/issues/11)) ([6140cf1](https://github.com/adobe/aem-import-helper/commit/6140cf1ff51efd74f97d6225ad4c122ea5544e77))
* Use multipart formdata to start a job ([#3](https://github.com/adobe/aem-import-helper/issues/3)) ([852d96d](https://github.com/adobe/aem-import-helper/commit/852d96d94f5576d5f622839718670c71730d107e))
