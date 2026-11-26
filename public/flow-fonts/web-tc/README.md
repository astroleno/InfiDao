# Web reading fonts

Classical passages in the Web reader use LXGW WenKai TC Regular. The derived WOFF faces use the InfiDao family names. The font release includes narrow rare subsets from LXGW WenKai Regular, Noto Serif CJK TC Regular, and Hanazono Mincho B. Each subset contains its original Unicode code points, and every license ships beside the fonts in the versioned release.

## Source files

The build checks the complete input SHA-256 digests. [Pinned source hashes](../../../scripts/build-web-flow-tc-fonts.py)

- LXGW WenKai TC Regular 1.530. [Release](https://github.com/lxgw/LxgwWenKaiTC/releases/tag/v1.530) · [TTF](https://github.com/lxgw/LxgwWenKaiTC/releases/download/v1.530/LXGWWenKaiTC-Regular.ttf)
- LXGW WenKai Regular 1.530. [Release](https://github.com/lxgw/LxgwWenKai/releases/tag/v1.530) · [TTF](https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf)
- Noto Serif CJK TC Regular Serif2.003. [Release](https://github.com/notofonts/noto-cjk/releases/tag/Serif2.003) · [OTF](https://raw.githubusercontent.com/notofonts/noto-cjk/Serif2.003/Serif/OTF/TraditionalChinese/NotoSerifCJKtc-Regular.otf)
- Hanazono Mincho B 2017-09-04. Extract `HanaMinB.ttf` from the archive. [Archive](https://sourceforge.net/projects/hanazono-font/files/hanazono-20170904.zip/download)
- The Web display projection derives from OpenCC 1.4.2 and uses its `s2t.json` configuration. The compiler checks every bundled classical passage against OpenCC before writing the reduced tables. [OpenCC](https://github.com/BYVoid/OpenCC/tree/ver.1.4.2) · [Apache-2.0 license](../../../shared/content/OpenCC-LICENSE)

## Regenerate the release

Use Node 22 or later and a Python environment with FontTools 4.68.0. Run from the repository root. Set `FONT_INPUTS` to the directory containing the four pinned source files and `FONT_BUILD` to a writable scratch directory.

```sh
npm install --prefix "$FONT_BUILD" --save-exact opencc@1.4.2
node scripts/build-web-classic-display.cjs "$FONT_BUILD/node_modules/opencc" "$FONT_BUILD/display-targets.json"
python scripts/build-web-flow-tc-fonts.py "$FONT_BUILD/display-targets.json" \
  --wenkai-tc "$FONT_INPUTS/LXGWWenKaiTC-Regular.ttf" \
  --wenkai "$FONT_INPUTS/LXGWWenKai-Regular.ttf" \
  --noto "$FONT_INPUTS/NotoSerifCJKtc-Regular.otf" \
  --hanazono "$FONT_INPUTS/HanaMinB.ttf"
npm run build:flow-release
```

The compiler writes the static browser display tables. The font recipe writes a versioned directory under `public/flow-assets` and updates `release.json` in this directory. The app build verifies the manifest and every asset before referencing that directory. Existing versioned directories continue to serve cached readers.
