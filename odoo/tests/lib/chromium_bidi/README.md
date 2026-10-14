# chromium-bidi

WebDriver BiDi implementation for Chromium, translating BiDi to the Chrome
DevTools Protocol from inside a browser tab. It is used by
`odoo.tests.common.ChromeBrowser` to drive Chrome through BiDi.

- Source: https://github.com/GoogleChromeLabs/chromium-bidi
- Version: 158.0.8104-0
- License: Apache-2.0 (`LICENSE`), bundled dependencies in `THIRD_PARTY_NOTICES`

`mapperTab.js` is `out/Default/gen/src/mapperTab.js` from the npm package,
unmodified. To update it:

```sh
npm pack chromium-bidi@<version>
tar xzf chromium-bidi-<version>.tgz
cp package/out/Default/gen/src/mapperTab.js .
cp package/out/Default/gen/src/mapper_bundle_THIRD_PARTY_NOTICES THIRD_PARTY_NOTICES
cp package/LICENSE .
```

`ODOO_BROWSER_BIDI_MAPPER` can point to another `mapperTab.js`, e.g. to match
an older or newer Chrome.
