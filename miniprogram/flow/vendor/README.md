# OpenType.js

`opentype.js` is the UMD `dist/opentype.min.js` from the npm package
`opentype.js@2.0.0`, vendored so the native mini program needs no npm build or CDN
at runtime. Its MIT license is in `opentype-LICENSE.txt` and does not license the
font assets themselves.

The sole source adjustment escapes a literal tab inside the SVG parser's
whitespace string as `\t`; the string value is unchanged and Git whitespace
checks no longer flag that line. No font parsing or drawing code is modified.

- Upstream: https://github.com/opentypejs/opentype.js
- Package: https://registry.npmjs.org/opentype.js/-/opentype.js-2.0.0.tgz
- SHA-256 of the upstream minified JS: `b39d7bf9661481cec5c118a0d92b02951171d99c30d4d11252a72ecb0285439e`
- Only `parse(ArrayBuffer, { lowMemory: true })` and glyph outlines are used.
- Browser font registration, networking, DOM and Node file APIs are not used.

Update by replacing this file from an explicitly pinned upstream package,
preserving its license, then run `npm test` and `npm run check` in `miniprogram/`.
