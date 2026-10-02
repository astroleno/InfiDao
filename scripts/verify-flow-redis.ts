// Isolated, real Redis verification. No production endpoint or model is used.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { createRedisDocumentBackend } from '../src/lib/flow/session-store-server';
import { createSessionStore, type StoredChain } from '../src/lib/flow/session-store';
import { createFlowBudget } from '../src/lib/flow/request-budget';
import type { FlowFrame } from '../src/lib/flow/contracts';

async function main() {
  const binary = process.env.FLOW_QA_REDIS_BINARY;
  if (!binary) throw new Error('Set FLOW_QA_REDIS_BINARY to the local redis-server binary');
  const directory = await mkdtemp(path.join(tmpdir(), 'flow-redis-'));
  const socket = path.join(directory, 'redis.sock');
  let processHandle: ChildProcess | null = null;
  const clients: Array<ReturnType<typeof createClient>> = [];
  async function start() {
    processHandle = spawn(binary!, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--dir', directory,
      '--appendonly', 'yes', '--appendfsync', 'always', '--save', '', '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction'], { stdio: 'ignore' });
    let failure: Error | null = null;
    processHandle.on('error', error => { failure = error; });
    for (let count = 0; count < 100; count++) {
      if (failure) throw failure;
      const client = createClient({ socket: { path: socket, reconnectStrategy: false, connectTimeout: 100 }, disableOfflineQueue: true });
      client.on('error', () => {});
      try { await client.connect(); clients.push(client); return client; } catch { if (client.isOpen) client.destroy(); }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Isolated Redis did not start');
  }
  async function stop() {
    for (const client of clients.splice(0)) if (client.isOpen) client.destroy();
    const child = processHandle; processHandle = null;
    if (child && child.exitCode === null) await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
  }
  const owner = 'reader', opening = { key: 'open:one', requestId: 'one', fingerprint: 'open-empty' };
  const state = (id: string, generationKey = opening.key): StoredChain => ({ owner, terms: ['知止'], seen: [], nodes: {}, branches: {}, updated: 0, generationKey,
    chain: { chainId: id, kind: 'remote', version: 'qa', seed: '', seedOrigin: 'example', focus: '知止', parentChainId: null,
      entry: null, frames: [], cursor: '0', exhausted: false } });
  try {
    let client = await start();
    const backend = () => createRedisDocumentBackend({ sendCommand: args => client.sendCommand(args) });
    const worker = (leaseMs = 1000) => createSessionStore(backend(), { createId: randomUUID, prefix: 'qa:flow:', leaseMs });
    const a = worker(), b = worker();
    const simultaneous = await Promise.allSettled([a.reserve(owner, opening), b.reserve(owner, opening)]);
    assert.equal(simultaneous.filter(item => item.status === 'fulfilled').length, 1);
    const reservation = (simultaneous.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof a.reserve>>>).value;
    await a.commitHead(owner, reservation.lease!, state('parent')); await a.release(owner, reservation.lease!);
    await stop(); client = await start();
    assert.equal((await worker().getChain(owner, 'parent')).chain.chainId, 'parent');
    await assert.rejects(worker().getChain('other-owner', 'parent'), { code: 'CHAIN_EXPIRED' });
    const old = (await worker(50).reserve(owner, opening)).lease!;
    await new Promise(resolve => setTimeout(resolve, 70));
    // Lua checks expiry even before a replacement worker acquires the operation.
    await assert.rejects(worker().commitComplete(owner, old, state('parent'), '0'), { code: 'OPERATION_EXPIRED' });
    const current = (await worker().reserve(owner, opening)).lease!;
    assert.equal(await worker().release(owner, old), false);
    const childLease = (await worker().reserve(owner, { key: 'branch:parent:word', requestId: 'branch', fingerprint: 'branch-word' })).lease!;
    const child = state('child', childLease.key); child.chain.parentChainId = 'parent';
    await worker().commitHead(owner, childLease, child, { id: 'parent', edge: 'word' });
    const parent = state('parent'); parent.chain.cursor = 'ready'; parent.initial = parent.chain;
    parent.chain.frames = [{ id: 'qa-frame', sourceId: 'qa-source', corpusVersion: 'qa-v1', textHash: 'qa-hash',
      quote: '知止', quoteStart: 0, quoteEnd: 2, fullText: '知止', meaning: '辨明所当安止的方向', reflection: '不进入语义索引',
      ordinal: 1, source: '大学', chapterLabel: '经一章', ready: true, provenance: 'model', anchors: [], reflectionSpans: [] } satisfies FlowFrame];
    await worker().commitComplete(owner, current, parent, '0');
    assert.equal((await worker().getChain(owner, 'parent')).branches.word, 'child');
    assert.equal((await worker().reserve(owner, opening)).result?.cursor, 'ready');
    await stop(); client = await start();
    const semanticRead = await worker().reserve(owner, { key: 'open:semantic', requestId: 'semantic', fingerprint: 'semantic' });
    assert.equal(semanticRead.semantics.length, 1);
    assert.equal(semanticRead.semantics[0]?.text, '辨明所当安止的方向');
    assert.equal(semanticRead.semantics[0]?.textHash, 'qa-hash');
    const otherRead = await worker().reserve('other-owner', opening);
    assert.equal(otherRead.semantics.length, 0);
    await worker().release(owner, semanticRead.lease!); await worker().release('other-owner', otherRead.lease!);
    const limits = { concurrentSite: 1, concurrentOwner: 1, concurrentIP: 1, requestsSite: 2, requestsOwner: 2,
      requestsIP: 2, modelsSite: 1, modelsOwner: 1, modelsIP: 1 };
    const budget = () => createFlowBudget(backend(), 'qa:budget', limits);
    const lease = await budget().acquire(owner, 'ip'); await lease.chargeModel();
    await assert.rejects(budget().acquire('other', 'other'), { code: 'BUDGET_REACHED' }); await lease.release();
    await stop(); client = await start();
    const afterRestart = await budget().acquire(owner, 'ip');
    await assert.rejects(afterRestart.chargeModel(), { code: 'BUDGET_REACHED' }); await afterRestart.release();
    const heldBudget = () => createFlowBudget(backend(), 'qa:held-budget', { concurrentSite: 3, concurrentOwner: 1, concurrentIP: 1,
      requestsSite: 20, requestsOwner: 10, requestsIP: 10, modelsSite: 3, modelsOwner: 3, modelsIP: 3 });
    const heldA = await heldBudget().acquire('held-a', 'held-a'), heldB = await heldBudget().acquire('held-b', 'held-b');
    const holds = await Promise.allSettled([heldA.reserveModels(3), heldB.reserveModels(3)]);
    assert.equal(holds.filter(result => result.status === 'fulfilled').length, 1);
    const winner = holds[0]!.status === 'fulfilled' ? heldA : heldB, loser = winner === heldA ? heldB : heldA;
    await stop(); client = await start();
    await assert.rejects(loser.reserveModels(1), { code: 'BUDGET_REACHED' });
    await assert.rejects(loser.chargeModel(), { code: 'BUDGET_REACHED' });
    await winner.chargeModel(); await winner.release();
    await assert.rejects(loser.reserveModels(3), { code: 'BUDGET_REACHED' });
    await loser.reserveModels(2); await loser.chargeModel(); await loser.chargeModel();
    await assert.rejects(loser.chargeModel(), { code: 'BUDGET_REACHED' }); await loser.release();
    console.log(JSON.stringify({ passed: true, checks: ['concurrent CAS', 'AOF restart', 'owner isolation', 'expired lease', 'stale release',
      'atomic child mapping', 'completion replay', 'semantic AOF restart', 'semantic owner isolation', 'shared concurrency', 'daily budget survives restart',
      'atomic model holds', 'model holds survive AOF restart', 'unreserved calls cannot steal holds', 'unused holds released without refunding charges'] }));
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
