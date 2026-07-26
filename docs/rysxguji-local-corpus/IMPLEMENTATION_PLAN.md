# Rysxguji Local Corpus Implementation Plan

Date: 2026-05-21

## Decision

Use `ref/rysxguji` as an acquisition/download source, then serve search from local generated artifacts:

```text
rysxguji/Daizhige -> download -> clean -> split -> local JSONL corpus -> embeddings -> local search
```

Do not make request-time online guji search a core search dependency. The previous cold online test was useful, but the measured 5-10s path is too slow and unstable for the main reading/search loop.

## Current Baseline

- GitHub data was restored locally, but the repository data corpus was only a 20-record sample.
- Remote branches also only contained the sample corpus plus 20 embeddings, so the gap was data-generation coverage, not just local sync.
- The local vector scan path is fast enough for thousands to tens of thousands of passages.
- Daizhige pages for the first batch are fetchable as static HTML with a real User-Agent.

## Implemented Corpus Batch

Sources:

- `论语`: `https://daizhige.org/儒藏/四书/论语.html`
- `孟子`: `https://daizhige.org/儒藏/四书/孟子.html`
- `大学`: `https://daizhige.org/儒藏/四书/大学.html`
- `中庸`: `https://daizhige.org/儒藏/四书/中庸.html`
- `诗经`: `https://daizhige.org/儒藏/诗经/诗经.html`
- `尚书`: `https://daizhige.org/儒藏/尚书/尚书.html`
- `周易`: `https://daizhige.org/易藏/易经/周易.html`
- `礼记`: `https://daizhige.org/儒藏/礼经/礼记.html`
- `仪礼`: `https://daizhige.org/儒藏/礼经/仪礼.html`
- `周礼`: `https://daizhige.org/儒藏/礼经/周礼.html`
- `春秋左传`: `https://daizhige.org/儒藏/春秋/春秋左传.html`
- `墨子`: `https://daizhige.org/子藏/诸子/墨子.html`
- `荀子`: `https://daizhige.org/子藏/诸子/荀子.html`
- `韩非子`: `https://daizhige.org/子藏/法家/韩非子.html`

Boundary note:

- `礼记` includes the surviving `乐记` chapter tradition.
- The lost `乐经` is not represented as a complete independent corpus source.

Generated artifacts:

- `data/rysxguji/sources.json`
- `data/rysxguji/guji-core-v1.jsonl`
- `data/rysxguji/provenance-v1.jsonl`
- `data/embeddings.json`
- `data/search-graph.json`

Current release-artifact facts:

- 14 works in `guji-core-v1`.
- 11,809 rysxguji corpus records and matching provenance records; the combined
  runtime corpus has 11,829 passages and embeddings.
- `data/search-graph.json` has 12,825 nodes and 24,084 edges.

## Runtime Contract

- `data/corpus-manifest.json` remains the single corpus entrypoint.
- `data/rysxguji/guji-core-v1.jsonl` stores cleaned passages.
- `data/rysxguji/provenance-v1.jsonl` stores provider/source URL/retrieval metadata.
- `data/rysxguji/sources.json` is the acquisition registry; the builder no longer hardcodes book URLs.
- Runtime search does not fetch Daizhige.
- Passage JSONL may include explicit `id` so generated rysxguji records do not collide with existing sample/golden ids.

## Regeneration Commands

```bash
node scripts/rysxguji/build-corpus.mjs
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

Optional limited run:

```bash
node scripts/rysxguji/build-corpus.mjs --books=论语,孟子,大学,中庸
```

## Validation Plan

Minimum:

```bash
npm run generate-search-artifacts
npm run type-check
npm test -- tests/unit/data/corpus.test.ts tests/unit/data/embeddings.test.ts --runInBand
npm test -- tests/unit/search/index-store.test.ts tests/unit/search/json-search.test.ts tests/unit/search/lexical.test.ts tests/unit/search/fusion.test.ts --runInBand
npm test -- tests/integration/api/search.route.test.ts --runInBand
npm run test:search-quality
```

Search smoke checks:

- `君子固穷`
- `兼爱`
- `性恶`
- `法不阿贵`
- `大学之道`
- `天命之谓性`
- `关关雎鸠`
- `乾元`
- `郑伯克段`

## Release evidence boundary

The visible golden and tuned-paraphrase regression fixtures keep known behavior
from regressing. They are not evidence of unseen generalization. A frozen
holdout is authored independently after the search artifacts and implementation
are frozen, then evaluated once under
`docs/qa/search-quality-methodology.md`.

## Next Expansion

1. Add confirmed core `老子` and `庄子` sources after resolving version choice; the local link list does not currently include clean canonical core URLs.
2. Add duplicate-id and duplicate-hash reports to the corpus builder.
3. Add a provenance lookup utility so future citations can show the original Daizhige URL for any local passage.
4. Revisit the concept embedding spec after corpus growth; current local embedding model is intentionally lightweight and may need more classical-domain aliases.
5. Add a dedicated retrieval-quality fixture for the newly imported classics.
