// Manual real-model run of a sealed end-to-end blind set; never part of CI.
// Each query opens a reading exactly as the reader does and keeps the one
// delivered passage for judging. Spends about three model calls per run.
//   npx tsx scripts/run-flow-blind.ts --set=docs/qa/flow-blind/2026-11-17-queries.json --out=/tmp/flow-blind.json
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const option = (name: string, fallback: string) =>
  process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

type Case = { id: string; query: string; need: string };

async function main() {
  process.env.FLOW_TIMINGS = '1';
  const { runFlow } = await import('../src/lib/flow/service');
  const set = JSON.parse(await readFile(option('set', ''), 'utf8')) as { id: string; cases: Case[] };
  const scopes = (option('scopes', 'core,core+poetry').split(',').map(scope => scope.split('+'))) as Array<Array<'core' | 'poetry'>>;
  const out = option('out', '/tmp/flow-blind.json');
  const results = [];
  for (const item of set.cases) {
    for (const scope of scopes) {
      const started = performance.now();
      const events: Array<{ type: string; code?: string; message?: string; chain?: { frames: Array<Record<string, unknown>> } }> = [];
      let firstAt: number | undefined;
      try {
        await runFlow({ op: 'open', requestId: randomUUID(), seed: item.query, contentPacks: [...scope] }, 'blind-eval-' + randomUUID(),
          AbortSignal.timeout(90_000), event => { events.push(event as never); if (event.type === 'head') firstAt ??= performance.now(); });
      } catch (error) {
        events.push({ type: 'error', code: (error as { code?: string }).code || 'UNAVAILABLE', message: String((error as Error).message) });
      }
      const final = [...events].reverse().find(event => event.type === 'done' || event.type === 'frame');
      const frame = final?.chain?.frames[0];
      const error = events.find(event => event.type === 'error');
      const result = {
        id: item.id, scope: scope.join('+'), query: item.query,
        seconds: +((performance.now() - started) / 1000).toFixed(1),
        firstQuoteSeconds: firstAt ? +((firstAt - started) / 1000).toFixed(1) : null,
        ...(frame ? { source: frame.source, work: (frame.work as { title?: string; author?: string } | undefined) ?? null,
          quote: frame.quote, meaning: frame.meaning, reflection: frame.reflection } : {}),
        ...(error ? { error: error.code, message: error.message } : {}),
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await writeFile(out, JSON.stringify({ set: set.id, ranAt: new Date().toISOString(), results }, null, 2));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
