# Rysxguji Corpus Artifacts

This directory contains generated local corpus artifacts sourced from rysxguji-compatible acquisition scripts.

- `guji-core-v1.jsonl`: cleaned and chunked passages loaded by `data/corpus-manifest.json`.
- `provenance-v1.jsonl`: sidecar records that map each generated passage id to its provider URL and retrieval timestamp.
- `sources.json`: enabled Daizhige source registry used by the corpus builder.

Regenerate the corpus from Daizhige:

```bash
node scripts/rysxguji/build-corpus.mjs
npm run generate-search-artifacts
npm run generate-search-graph
```

The runtime search path reads local JSONL and `data/embeddings.json`; Daizhige is used at build/acquisition time, not as a default request-time dependency.

The core Confucian classics batch includes `诗经`, `尚书`, `周易`, `礼记`, `仪礼`, `周礼`, and `春秋左传`. `礼记` includes the surviving `乐记` chapter tradition; it is not treated as a complete lost `乐经`.
