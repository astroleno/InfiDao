# Rysxguji Corpus Artifacts

This directory contains generated local corpus artifacts sourced from
rysxguji-compatible acquisition scripts. The active corpus covers 14 works.

- `guji-core-v1.jsonl`: cleaned and chunked passages loaded by `data/corpus-manifest.json`.
- `provenance-v1.jsonl`: sidecar records that map each generated passage id to its provider URL and retrieval timestamp.
- `sources.json`: enabled Daizhige source registry used by the corpus builder.

The rysxguji batch has 11,809 corpus records and 11,809 provenance records,
with no duplicate IDs or missing provenance. The full runtime corpus also keeps
20 established records, so the committed search artifacts contain 11,829
passages/embeddings. The optional graph sidecar currently has 12,825 nodes and
24,084 edges.

Regenerate the corpus from Daizhige:

```bash
node scripts/rysxguji/build-corpus.mjs
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

The runtime search path reads local JSONL and `data/embeddings.json`; Daizhige is used at build/acquisition time, not as a default request-time dependency.

Run `npm run test:search-quality` after regeneration. Its visible golden and
tuned-paraphrase regression sets are not a frozen holdout; the one-shot holdout
protocol is defined in `docs/qa/search-quality-methodology.md`.

The core Confucian classics batch includes `诗经`, `尚书`, `周易`, `礼记`, `仪礼`, `周礼`, and `春秋左传`. `礼记` includes the surviving `乐记` chapter tradition; it is not treated as a complete lost `乐经`.
