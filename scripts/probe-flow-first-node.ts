// Manual real-model comparison; fixed fixture data only, never part of CI.
// npx tsx scripts/probe-flow-first-node.ts
import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { flowJson } = await import('../src/lib/flow/model');
  const { candidatesFor, planFocus } = await import('../src/lib/flow/candidates');
  const { verifyGenerated, parseGeneratedBatch } = await import('../src/lib/flow/service');
  const { reviewRelations } = await import('../src/lib/flow/relations');
  const source = await readFile('src/lib/flow/service.ts', 'utf8');
  const prompt = source.match(/const NODE_PROMPT = `([\s\S]*?)`;/u)?.[1];
  if (!prompt) throw new Error('Cannot locate baseline node prompt');
  const inputs = ['我有很多事想做，却不知道先做哪一件。', '我一直准备，却迟迟没有迈出第一步。', '我想认真听对方说话，但常忍不住插话。'];
  const results = [];
  for (const [index, seed] of inputs.entries()) {
    const signal = AbortSignal.timeout(90000);
    const planning = performance.now();
    const plan = await planFocus(seed, signal);
    const candidates = await candidatesFor(plan.terms, plan.focus, new Set());
    const planningMs = Math.round(performance.now() - planning);
    for (const size of index % 2 ? [1, 3] : [3, 1]) {
      const started = performance.now();
      try {
        const raw = await flowJson(prompt + (size === 1 ? '\n本次只准备当前最相关的一个节点，frames最多1项；后续经文由下一次请求接续。' : ''), {
          seed, focus: plan.focus, head: null,
          candidates: candidates.map(row => ({ sourceId: row.id, source: row.source, chapter: row.chapter, text: row.text.slice(0, 2400) })),
        }, signal);
        const generatedMs = Math.round(performance.now() - started);
        const verified = verifyGenerated(parseGeneratedBatch(raw), candidates, 1);
        const frames = await reviewRelations(verified, seed, plan.focus, candidates, signal);
        const result = { seed, size, planningMs, generatedMs, readyMs: Math.round(performance.now() - started), frames };
        results.push(result);
        console.log(JSON.stringify({ seed, size, planningMs, generatedMs, readyMs: result.readyMs, count: frames.length,
          preview: frames.map(frame => ({ quote: frame.quote, meaning: frame.meaning, reflection: frame.reflection, anchors: frame.anchors.length })) }));
      } catch (error) {
        const result = { seed, size, planningMs, readyMs: Math.round(performance.now() - started), error: String(error) };
        results.push(result); console.log(JSON.stringify(result));
      }
      await writeFile(process.env.FLOW_FIRST_NODE_OUTPUT || '/tmp/infidao-first-node-comparison.json', JSON.stringify(results, null, 2));
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
