import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolveContentScope } from '@/lib/content/scope';
import { activePoetryPassage, resetContentStore } from '@/lib/content/store';
import type { ContentScope } from '@/lib/content/contracts';
import { findFlowPassage } from '@/lib/flow/candidates';
import { FlowError, type FlowChain, type FlowEvent, type FlowFrame, type FlowRequest } from '@/lib/flow/contracts';
import { lexicalBreaks } from '@/lib/flow/lexemes';
import { flowModelConfig } from '@/lib/flow/model';
import { withFlowModelBudget } from '@/lib/flow/model-budget';
import { runFlow } from '@/lib/flow/service';
import { createSessionStore, MemoryDocumentBackend } from '@/lib/flow/session-store';
import frozen from '../docs/qa/flow-blind/2026-11-26-batch2-fixed-points.json';

type Point = (typeof frozen.cases)[number];
type Retrieval = Parameters<NonNullable<Parameters<typeof runFlow>[5]>>[0];
type ProviderReceipt = { phase: string; status?: number; candidateOk?: boolean };

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const describeError = (error: unknown) => error instanceof FlowError ? error.code
  : error instanceof Error && error.name === 'TimeoutError' ? 'LOCAL_TIMEOUT' : 'LOCAL_PROBE_ERROR';

export async function probe(entry: Point, scope: ContentScope, endpoint: string, lookup = findFlowPassage) {
  const point = entry.point!;
  const passage = await activePoetryPassage(point.sourceId, scope.versions.poetry!);
  assert.ok(passage?.work && passage.corpusVersion === point.corpusVersion && passage.textHash === point.textHash &&
    passage.text === point.passage && hash(passage.text) === point.textHash &&
    passage.text.slice(point.start, point.end) === point.text);
  const frame: FlowFrame = {
    id: 'parent-frame', ordinal: 1, sourceId: passage.id, source: passage.source, chapterLabel: passage.chapter,
    work: passage.work, corpusVersion: passage.corpusVersion, textHash: passage.textHash, fullText: passage.text,
    quote: point.text, quoteStart: point.start, quoteEnd: point.end, lexicalBreaks: lexicalBreaks(passage.text),
    meaning: '今日读来', textBreaks: { meaning: [2, 4], reflection: [] },
    reflection: '先看这一联所呈现的场景与关系。', reflectionSpans: [], anchors: [], provenance: 'model', ready: true,
  };
  const selection = frame.lexicalBreaks!.map((end, index) => ({ start: frame.lexicalBreaks![index - 1] ?? 0, end }))
    .find(range => range.start >= point.tokenStart && range.end <= point.tokenEnd && /\p{L}/u.test(passage.text.slice(range.start, range.end)));
  assert.ok(selection, 'Frozen point does not contain a canonical clickable token');
  const word = passage.text.slice(selection.start, selection.end);
  const owner = 'same-poem-qa';
  const chain: FlowChain = {
    chainId: 'parent', version: 'fixture', seed: entry.need, seedOrigin: 'user', focus: entry.need, parentChainId: null,
    entry: null, frames: [frame], cursor: '1', exhausted: false, contentScope: scope, kind: 'remote', graph: true,
  };
  const store = createSessionStore(new MemoryDocumentBackend(), { createId: randomUUID });
  const lease = (await store.reserve(owner, { requestId: 'parent', key: 'parent', fingerprint: 'parent' })).lease!;
  await store.commitHead(owner, lease, {
    owner, chain, terms: entry.terms, seen: [frame.sourceId], nodes: { [frame.id]: frame }, branches: {},
    generationKey: 'parent', updated: Date.now(), recentReadings: [], priorQuotes: [],
  });
  const request: FlowRequest = {
    op: 'branch', requestId: 'child', chainId: chain.chainId, fromFrameId: frame.id, graph: true, contentPacks: scope.packIds,
    anchorId: 'text:' + selection.start + ':' + selection.end,
    selection: { ...selection, corpusVersion: frame.corpusVersion, textHash: frame.textHash },
  };
  const matchingEvidence = (range: { sourceId: string; corpusVersion: string; textHash: string }) =>
    entry.evidence.filter(e => e.sourceId === range.sourceId && e.corpusVersion === range.corpusVersion && e.textHash === range.textHash);
  const excerptText = (start: number, end: number) => passage.text.slice(start, end);
  const receipts: ProviderReceipt[] = [];
  const events: FlowEvent[] = [];
  let retrieval: Retrieval | undefined, error: string | undefined, reserved = 0, charged = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (input !== endpoint) return original(input, init);
    const body = JSON.parse(String(init?.body));
    const payload = JSON.parse(body.messages[1].content);
    const receipt: ProviderReceipt = {
      phase: Array.isArray(payload.candidates) ? 'generate' : Array.isArray(payload.frames) ? 'review' : 'plan',
    };
    if (receipt.phase === 'generate' && retrieval) {
      const window = retrieval.compact.find(range => range.sourceId === passage.id);
      const own = payload.candidates.filter((candidate: { sourceId: string }) => candidate.sourceId === passage.id);
      receipt.candidateOk = !!window && own.length === 1 && own[0].excerptStart === window.start &&
        own[0].text === excerptText(window.start, window.end);
    }
    receipts.push(receipt);
    const response = await original(input, init);
    receipt.status = response.status;
    return response;
  };
  const started = performance.now();
  try {
    await withFlowModelBudget({
      async reserveModels(count) {
        if (reserved + count > 4) throw new FlowError('BUDGET_REACHED', 'Local QA model limit');
        reserved += count;
      },
      async chargeModel() {
        if (charged >= reserved) throw new FlowError('BUDGET_REACHED', 'Local QA model limit');
        charged++;
      },
    }, () => runFlow(request, owner, AbortSignal.timeout(90000), event => events.push(event), store, observation => { retrieval = observation; }));
  } catch (cause) { error = describeError(cause); }
  finally { globalThis.fetch = original; }
  const elapsedMs = Math.round(performance.now() - started);
  const childOf = (child?: FlowChain) => !!child && child.chainId !== chain.chainId && child.parentChainId === chain.chainId &&
    child.entry?.fromFrameId === frame.id && child.entry.anchorId === request.anchorId && child.entry.label === word;
  const completed = events.find(event => event.type === 'frame');
  const done = events.at(-1);
  const final = done?.type === 'done' ? done.chain.frames[0] : undefined;
  let canonical: Awaited<ReturnType<typeof findFlowPassage>>;
  let verificationError: string | undefined;
  try {
    if (final) canonical = await lookup(final.sourceId, final.corpusVersion);
  } catch {
    verificationError = 'LOCAL_SOURCE_LOOKUP_FAILED';
  }
  const quoteVerified = verificationError ? null : !!(canonical && final && canonical.corpusVersion === final.corpusVersion &&
    canonical.textHash === final.textHash && hash(canonical.text) === final.textHash &&
    canonical.text === final.fullText && final.quoteStart >= 0 && final.quoteEnd === final.quoteStart + final.quote.length &&
    canonical.text.slice(final.quoteStart, final.quoteEnd) === final.quote);
  const sameWork = final && quoteVerified !== null ? !!(quoteVerified && canonical?.work?.workId === passage.work.workId &&
    canonical.work.revision === passage.work.revision) : null;
  const exactFrozenEvidence = final && quoteVerified !== null ? quoteVerified && matchingEvidence(final).some(evidence => final.quoteStart === evidence.start &&
    final.quoteEnd === evidence.end && final.quote === evidence.text) : null;
  const containsFrozenEvidence = final && quoteVerified !== null ? quoteVerified && matchingEvidence(final).some(evidence => final.quoteStart <= evidence.start &&
    final.quoteEnd >= evidence.end) : null;
  const ownWindow = retrieval?.compact.find(range => range.sourceId === passage.id);
  const foundEvidence = retrieval ? retrieval.compact.flatMap((range, index) =>
    matchingEvidence(range).some(evidence => range.start <= evidence.start && range.end >= evidence.end) ? [index + 1] : []) : null;
  const relation = done?.type === 'done' && completed?.type === 'frame' && childOf(done.chain) && childOf(completed.chain) &&
    completed.chain.chainId === done.chain.chainId && final?.ready === true && quoteVerified &&
    isDeepStrictEqual(completed.chain.frames[0], final) && !error ? 'pass' : error === 'RELATION_UNVERIFIED' ? 'fail' : 'unknown';
  return {
    id: entry.id, title: passage.work.title, word, selection: request.selection,
    frozenEvidence: entry.evidence.map(e => ({ sourceId: e.sourceId, start: e.start, end: e.end, quote: e.text })),
    plannerTerms: retrieval?.terms ?? null, recalledCount: retrieval?.recalled.length ?? null, compactCount: retrieval?.compact.length ?? null,
    ownWindow: ownWindow ? { ...ownWindow, quote: excerptText(ownWindow.start, ownWindow.end) } : null,
    frozenEvidenceWindowRanks: foundEvidence, selectedSameWork: sameWork, exactFrozenEvidence, containsFrozenEvidence,
    quoteVerified, relation, final: final ? { source: final.source, chapter: final.chapterLabel, sourceId: final.sourceId,
      corpusVersion: final.corpusVersion, textHash: final.textHash, start: final.quoteStart, end: final.quoteEnd, quote: final.quote } : null,
    error: error ?? verificationError ?? null, events: events.map(event => event.type), receipts, charged, elapsedMs,
  };
}

async function main() {
  assert.deepEqual(process.argv.slice(2), ['--live-model'], 'Use --live-model for the three real model cases');
  if (!process.getBuiltinModule?.('node:sqlite')) throw new Error('Node 22.13+ with node:sqlite is required');
  // The observer records structured milestones. Timings can include operator
  // configuration, so keep that independent logging out of the QA artifact.
  delete process.env.FLOW_TIMINGS;
  const { endpoint, model } = flowModelConfig();
  const scope = await resolveContentScope(['core', 'poetry']);
  assert.ok(scope.versions.poetry && !scope.unavailable.length);
  const points = frozen.cases.filter(entry => entry.group === 'poetry' && entry.point);
  assert.deepEqual(points.map(entry => entry.id), ['P1', 'P2', 'P3']);
  // Exercise the independent lookup for all frozen evidence before spending
  // model calls. It uses versioned sources for both packs.
  const references = [...points.flatMap(point => point.evidence), { sourceId: 'rysxguji-daxue-1-2', corpusVersion: scope.versions.core }];
  for (const ref of references) {
    const row = await findFlowPassage(ref.sourceId, ref.corpusVersion);
    assert.ok(row && row.corpusVersion === ref.corpusVersion);
    if ('textHash' in ref) assert.ok(row.textHash === ref.textHash && row.text.slice(ref.start, ref.end) === ref.text);
  }
  console.log(JSON.stringify({ kind: 'authentic-local-model', model, packRevision: scope.versions.poetry,
    planned: points.length, maxCallsPerInvocation: 12 }));
  for (const point of points) {
    const result = await probe(point, scope, endpoint);
    console.log(JSON.stringify(result));
    if (result.receipts.some(receipt => [401, 402, 403, 429].includes(receipt.status ?? 0))) break;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(describeError(error));
    process.exitCode = 1;
  }).finally(resetContentStore);
}
