// Manual production QA. The default invocation performs only public GETs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isDeepStrictEqual as equal } from 'node:util';
import { chromium } from 'playwright';
import classicText from '../shared/flow/classic-text.js';

const origin = 'https://aitoshuu.me';
const cdn = 'https://assets.aitoshuu.me';
const reader = origin + '/InfiDao';
const repository = fileURLToPath(new URL('../', import.meta.url));
const seedQuote = '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。';
const candidates = ['止', '静', '得', '定'];
const ownerName = '__Host-infidao_flow';
const viewport = { width: 390, height: 844 };
const caps = { open: 2, branch: 4 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const releasePattern = /^infidao-[0-9a-f]{16}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const gitFile = (commit, file) => execFileSync('git', ['show', commit + ':' + file], {
  cwd: repository, maxBuffer: 24 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
});
const limited = code => typeof code === 'string' && /(?:BUDGET|QUOTA|RATE|LIMIT)/i.test(code);
const safeCode = code => typeof code === 'string' && /^[A-Z][A-Z_0-9]{1,59}$/.test(code) ? code : undefined;

function options() {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean' }, commit: { type: 'string' }, release: { type: 'string' },
    'entry-sha': { type: 'string' }, 'cold-only': { type: 'boolean' }, output: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) return values;
  if (values['cold-only'] && !values.live) throw new Error('--cold-only requires --live');
  if (values.live && (!values.commit || !values.release || !values['entry-sha'] || !values.output)) {
    throw new Error('Live requires --commit, --release, --entry-sha, and --output');
  }
  values.commit ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  if (!commitPattern.test(values.commit) || (values.release && !releasePattern.test(values.release)) ||
      (values['entry-sha'] && !digestPattern.test(values['entry-sha']))) throw new Error('Invalid release identity');
  if (values.output) {
    const output = resolve(values.output);
    const inside = relative(repository, output);
    if (!isAbsolute(inside) && (inside === '' || !/^\.\.(?:\/|$)/.test(inside))) {
      throw new Error('Choose a new output directory outside the repository');
    }
    values.output = output;
  }
  return values;
}

async function publicGet(url) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(new URL(url).pathname + ' returned HTTP ' + response.status);
  return response;
}

function activeAssets(html) {
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="(\/_next\/static\/[\w./-]+\.js)"/g)].map(match => match[1]))].sort();
  const pageBundles = scripts.filter(path => /\/app\/infidao\/page-[a-f0-9]+\.js$/.test(path));
  const fontManifests = [...new Set([...html.matchAll(/<link[^>]+href="([^"]*\/flow-assets\/v-[\w-]+\/manifest\.json)"/g)].map(match => match[1]))];
  if (pageBundles.length !== 1 || fontManifests.length !== 1) throw new Error('Public reader assets are ambiguous');
  const font = new URL(fontManifests[0], origin);
  if (font.origin !== cdn && font.origin !== origin) throw new Error('Unexpected font manifest origin');
  return { entry: pageBundles[0], scripts, fontManifest: font.href,
    fontRelease: font.pathname.match(/\/(infidao-[0-9a-f]{16})\/flow-assets\//)?.[1] };
}

async function verifyRelease(config) {
  const assets = activeAssets(await (await publicGet(reader)).text());
  const id = config.release || assets.fontRelease;
  if (!id) throw new Error('Supply --release when the reader has no versioned CDN prefix');
  if (!config['entry-sha'] && id !== assets.fontRelease) {
    throw new Error('Supply --entry-sha to bind an application with a different font CDN release');
  }
  const manifestUrl = origin + '/flow-releases/' + id + '.json';
  const [manifest, entryBytes, fontBytes] = await Promise.all([
    publicGet(manifestUrl).then(response => response.json()),
    publicGet(origin + assets.entry).then(response => response.arrayBuffer()),
    publicGet(assets.fontManifest).then(response => response.arrayBuffer()),
  ]);
  const entrySha256 = sha(Buffer.from(entryBytes));
  const fontSha256 = sha(Buffer.from(fontBytes));
  if (manifest.id !== id || manifest.commit !== config.commit || !digestPattern.test(manifest.codeSha256) ||
      manifest.worktreeDirty === true) throw new Error('Application manifest did not match the expected commit and release');
  if (!assets.fontManifest.endsWith(manifest.fontBasePath + '/manifest.json') || fontSha256 !== manifest.fontManifestSha256) {
    throw new Error('Active reader fonts did not match the application manifest');
  }
  if (config['entry-sha'] && entrySha256 !== config['entry-sha']) throw new Error('Active reader entry did not match the expected SHA-256');
  return { ...assets, id, commit: manifest.commit, manifestUrl, codeSha256: manifest.codeSha256, entrySha256, fontSha256,
    corpusVersion: manifest.corpusVersion, corpusSha256: manifest.corpusSha256 };
}

function loadCorpus(release) {
  const manifest = gitFile(release.commit, 'data/corpus-manifest.json');
  const spec = JSON.parse(manifest);
  const digest = createHash('sha256').update(manifest);
  const rows = new Map();
  for (const { path } of spec.files) {
    if (!/^data\/[\w/-]+\.jsonl$/.test(path)) throw new Error('Invalid corpus path');
    const data = gitFile(release.commit, path);
    digest.update(data);
    for (const line of data.toString().trimEnd().split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      rows.set(row.id, row.text);
    }
  }
  if (spec.version !== release.corpusVersion || digest.digest('hex') !== release.corpusSha256) {
    throw new Error('Corpus at the expected commit did not match the release manifest');
  }
  return rows;
}

// This function is serialized into each isolated browser context. Raw response
// records stay in memory so opaque request and chain IDs never reach disk.
function instrument() {
  const probe = window.flowPublicProbe = { calls: [], clicks: [], target: null };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.href, location.href);
    if (url.origin !== location.origin || init?.method !== 'POST' ||
        !['/api/flow', '/api/flow/session'].includes(url.pathname)) return original(input, init);
    const request = JSON.parse(init.body);
    const target = probe.target;
    if (target && request.op === 'branch' && !request.prefetch && request.fromFrameId === target.parentId) {
      target.requestId ??= request.requestId;
    }
    const call = { path: url.pathname, request, at: performance.now(), events: [] };
    probe.calls.push(call);
    try {
      const response = await original(input, { ...init, redirect: 'error' });
      call.status = response.status;
      if (call.path !== '/api/flow') return response;
      void (async () => {
        if (!response.ok) {
          call.code = (await response.clone().json().catch(() => null))?.error?.code;
          return;
        }
        const stream = response.clone().body.pipeThrough(new TextDecoderStream()).getReader();
        const record = line => {
          if (!line.trim()) return;
          const event = JSON.parse(line);
          if (event.requestId === request.requestId) call.events.push({ at: performance.now(), event });
        };
        let pending = '';
        while (true) {
          const { value, done } = await stream.read();
          if (done) break;
          pending += value;
          let end;
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);
            record(line);
          }
        }
        record(pending);
      })().catch(() => { call.captureFailed = true; }).finally(() => { call.end = performance.now(); });
      return response;
    } catch (error) {
      call.captureFailed = true;
      call.end = performance.now();
      throw error;
    }
  };
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const el = event.target;
    const button = el.closest?.('button');
    const parent = button?.closest('[data-flow-frame]');
    const target = probe.target;
    const at = performance.now();
    if (target && parent?.dataset.flowFrame === target.parentId && button.closest('[data-flow-heading]') &&
        button.textContent.trim() === target.word) probe.clicks.push({ kind: 'word', at, trusted: true });
    else if (target && button?.closest('[data-flow-arrival]') && button.textContent.trim() === '去读') {
      probe.clicks.push({ kind: 'go', at, trusted: true });
    } else if (el.closest?.('[data-flow-viewport]') && !el.closest('[data-flow-frame], button, a, input, textarea')) {
      probe.clicks.push({ kind: 'blank', at, trusted: true });
    }
  }, true);

  probe.call = () => probe.target && probe.calls.find(call => call.request.requestId === probe.target.requestId);
  const clock = () => performance.now();
  function sample() {
    requestAnimationFrame(sample);
    const target = probe.target;
    const call = probe.call();
    if (!target || !call) return;
    target.currentlyReadable = false;
    const frame = call.events.flatMap(({ event }) => event.chain?.frames || []).find(f => f.id !== target.parentId &&
      typeof f.fullText === 'string' && f.quote && Number.isInteger(f.quoteStart) && f.quoteStart >= 0 &&
      f.quoteEnd === f.quoteStart + f.quote.length && f.fullText.slice(f.quoteStart, f.quoteEnd) === f.quote);
    if (!frame) return;
    const dock = [...document.querySelectorAll('[data-flow-arrival] button')].find(el => el.textContent.trim() === '去读');
    const dockRect = dock?.getBoundingClientRect();
    if (dockRect?.width && dockRect.height && dock.contains(document.elementFromPoint(
      dockRect.left + dockRect.width / 2, dockRect.top + dockRect.height / 2,
    ))) target.goAvailable ??= clock();
    const article = [...document.querySelectorAll('[data-flow-frame]')].find(el => el.dataset.flowFrame === frame.id);
    const heading = article?.querySelector('[data-flow-heading]');
    const panel = document.querySelector('[data-flow-viewport]');
    if (!heading || !panel) return;

    const rect = heading.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const view = window.visualViewport;
    const bounds = {
      top: Math.max(panelRect.top, view?.offsetTop ?? 0),
      bottom: Math.min(panelRect.bottom, (view?.offsetTop ?? 0) + (view?.height ?? innerHeight)),
      left: Math.max(panelRect.left, view?.offsetLeft ?? 0),
      right: Math.min(panelRect.right, (view?.offsetLeft ?? 0) + (view?.width ?? innerWidth)),
    };
    const overlap = overlay => overlay.width > 0 && overlay.height > 0 && rect.left < overlay.right &&
      rect.right > overlay.left && rect.top < overlay.bottom && rect.bottom > overlay.top;
    const hint = [...panel.parentElement.querySelectorAll(':scope > div > button')].find(button => button.textContent.trim() === '知道了');
    const overlays = [...document.querySelectorAll('[data-flow-arrival], [data-flow-tools], [data-phase][data-has-quote]')];
    const displayed = el => {
      const style = getComputedStyle(el);
      return style.visibility === 'visible' && Number(style.opacity) > 0;
    };
    const hintVisible = !!hint && displayed(hint.parentElement);
    const hintObstructed = hintVisible && overlap(hint.parentElement.getBoundingClientRect());
    const obstructed = hintObstructed || overlays.some(el => displayed(el) && overlap(el.getBoundingClientRect()));
    const ink = heading.dataset.inkPhase;
    const geometry = { edges: [rect.top, rect.bottom, rect.left, rect.right], bounds, ink, obstructed, hintVisible, hintObstructed };
    target.lastGeometry = geometry;
    const visible = rect.width > 0 && rect.height > 0 && rect.top >= bounds.top && rect.bottom <= bounds.bottom &&
      rect.left >= bounds.left && rect.right <= bounds.right && !obstructed && ink === 'settled' &&
      !heading.querySelector('[data-flow-ink], [data-flow-bent]') &&
      getComputedStyle(heading).visibility === 'visible' && Number(getComputedStyle(heading).opacity) > 0 &&
      heading.textContent.includes(frame.quote);
    target.currentlyReadable = visible;
    if (target.visual) return;
    if (!visible) {
      target.previous = null;
      return;
    }
    if (target.previous?.id === frame.id && geometry.edges.every((value, index) => Math.abs(value - target.previous.geometry.edges[index]) < 0.5)) {
      target.visual = { ...target.previous, verifiedAt: clock() };
    } else target.previous = {
      id: frame.id, sourceId: frame.sourceId, corpusVersion: frame.corpusVersion,
      textHash: frame.textHash, quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd, at: clock(), geometry,
    };
  }
  requestAnimationFrame(sample);
}

function requestMatches(body, permit) {
  if (!body?.requestId || body.op !== permit.op || body.prefetch || body.restartFrom || body.rebaseFrom ||
      body.cursor !== undefined || body.graph !== true) return false;
  if (body.op === 'open') return body.seed === '' && body.chainId === undefined && body.fromFrameId === undefined &&
    body.anchorId === undefined && body.selection === undefined && equal(body.contentPacks, ['core']);
  return body.seed === undefined && body.chainId === permit.chainId && body.fromFrameId === permit.parentId &&
    body.anchorId === 'text:' + permit.selection.start + ':' + permit.selection.end &&
    equal(body.selection, permit.selection) && equal(body.contentPacks, permit.packs);
}

async function browserSlot(browser, owner, report, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, serviceWorkers: 'block' });
  if (owner) await context.addCookies([owner]);
  const slot = { context, page: await context.newPage(), label, owner, permit: null, sessionSent: false };
  const validated = new Promise(resolveGate => { slot.validate = resolveGate; });
  const page = slot.page;
  page.on('response', response => {
    if (response.status() === 429 && response.request().method() === 'POST') report.stop = 'HTTP 429';
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (['GET', 'HEAD'].includes(method) && [origin, cdn].includes(url.origin)) return route.continue();
    const reject = kind => {
      report.blocked[kind] = (report.blocked[kind] || 0) + 1;
      return route.abort('blockedbyclient');
    };
    if (method !== 'POST' || url.origin !== origin || url.search ||
        !['/api/flow', '/api/flow/session'].includes(url.pathname)) return reject('other');
    let body;
    try { body = request.postDataJSON(); } catch { return reject('invalidBody'); }
    if (!await validated || report.stop) return reject('closed');
    if (url.pathname === '/api/flow/session') {
      if (slot.sessionSent || !equal(body, {})) return reject('session');
      slot.sessionSent = true;
      report.sent.session++;
      return route.continue();
    }
    const permit = slot.permit;
    if (!permit || permit.sent || !requestMatches(body, permit)) return reject(body?.prefetch ? 'prefetch' : 'unpermittedFlow');
    const owners = (await context.cookies(origin)).filter(cookie => cookie.name === ownerName);
    if (owners.length !== 1 || (slot.owner && owners[0].value !== slot.owner.value)) {
      report.stop = 'Anonymous identity missing or changed';
      return reject('owner');
    }
    if (report.stop || slot.permit !== permit || permit.sent || report.sent[body.op] >= report.caps[body.op]) return reject('cap');
    slot.owner = owners[0];
    permit.sent = true;
    permit.requestId = body.requestId;
    report.sent[body.op]++;
    permit.signal?.();
    return route.continue();
  });
  await page.addInitScript(instrument);
  return slot;
}

async function trustedBlank(page) {
  const before = await page.evaluate(() => window.flowPublicProbe.clicks.length);
  const handle = await page.waitForFunction(() => {
    const panel = document.querySelector('[data-flow-viewport]');
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    for (const yScale of [0.5, 0.3, 0.65, 0.18, 0.78]) {
      for (const xScale of [0.04, 0.96, 0.14, 0.86, 0.5]) {
        const x = rect.left + rect.width * xScale, y = rect.top + rect.height * yScale;
        const found = document.elementFromPoint(x, y);
        if (panel.contains(found) && !found.closest('[data-flow-frame], button, a, input, textarea, [role=button]')) return { x, y };
      }
    }
    return false;
  }, null, { timeout: 7000 });
  const point = await handle.jsonValue();
  await handle.dispose();
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(index => document.querySelector('[data-flow-stream][data-paused="true"]') &&
    window.flowPublicProbe.clicks.slice(index).some(click => click.kind === 'blank'), before, { timeout: 5000 });
  return point;
}

async function hitButton(page, locator) {
  await locator.waitFor({ state: 'attached', timeout: 4500 });
  const point = await locator.evaluate(el => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return !el.disabled && rect.width && rect.height && el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  });
  if (!point) throw new Error('Button was not hit-testable');
  await page.mouse.click(point.x, point.y);
  return point;
}

const event = (call, type) => call?.events.find(record => record.event.type === type);
const errors = call => [call?.code, ...call?.events.filter(record => record.event.type === 'error').map(record => record.event.code) || []];
const isCanonical = f => f && typeof f.fullText === 'string' && !!f.quote && Number.isInteger(f.quoteStart) && f.quoteStart >= 0 &&
  f.quoteEnd === f.quoteStart + f.quote.length && f.fullText.slice(f.quoteStart, f.quoteEnd) === f.quote && sha(f.fullText) === f.textHash;
const heading = slot => slot.page.locator('[data-flow-frame="' + slot.parent.id + '"][data-flow-ready="true"] [data-flow-heading]');

async function openRoot(slot, report) {
  const { page, label } = slot;
  const result = report.roots[label] = {};
  const permit = slot.permit = { op: 'open' };
  try {
    const response = await page.goto(reader, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok() || response.url() !== reader) throw new Error('Unexpected reader navigation');
    const assets = activeAssets(await response.text());
    if (!equal(assets.scripts, report.release.scripts) || assets.fontManifest !== report.release.fontManifest) {
      throw new Error('Browser page did not match the verified public release');
    }
    slot.validate(true);
    await page.waitForFunction(() => window.flowPublicProbe.calls.some(c => c.request.op === 'open' && c.end) ||
      window.flowPublicProbe.calls.some(c => c.path === '/api/flow/session' && c.status >= 400), null, { timeout: 95000 }).catch(() => {});
    const { call, session } = await page.evaluate(id => ({
      call: window.flowPublicProbe.calls.find(c => c.request.requestId === id && c.request.op === 'open'),
      session: window.flowPublicProbe.calls.find(c => c.path === '/api/flow/session')?.status,
    }), permit.requestId);
    if (errors(call).some(limited)) report.stop = 'Production budget or rate limit';
    result.sessionStatus = session;
    result.status = call?.status;
    result.error = safeCode(errors(call).find(Boolean));
    const chain = event(call, 'done')?.event.chain;
    const parent = chain?.frames?.[0];
    if (report.stop || call?.captureFailed || !call?.end || errors(call).some(Boolean) || chain?.frames.length !== 1 ||
      chain.parentChainId !== null || chain.kind !== 'remote' || chain.seed !== '' || chain.graph !== true ||
      !chain.contentScope?.fingerprint || chain.contentScope.unavailable?.length || !parent.ready ||
      parent.quote !== seedQuote || !isCanonical(parent)) {
      result.reason = 'Complete independent canonical root unavailable';
      return;
    }
    slot.chain = chain;
    slot.parent = parent;
    result.reflectionSha256 = sha(parent.reflection);
    await heading(slot).waitFor({ state: 'visible', timeout: 12000 });
    result.blank = await trustedBlank(page);
    slot.rootPath = await page.evaluate(() => history.state?.flowPathId);
    result.ready = !!slot.rootPath;
  } catch {
    result.reason = 'Reader identity, opening, root heading or blank pause could not be verified';
  } finally {
    slot.validate(false);
    slot.permit = null;
    result.sent = !!permit.sent;
  }
}

function compareRoots(a, b) {
  if (!a?.rootPath || !b?.rootPath) return { eligible: false, reason: 'Two complete independent roots unavailable' };
  const checks = {
    sameOwner: a.owner.value === b.owner.value,
    independent: a.chain.chainId !== b.chain.chainId && a.parent.id !== b.parent.id,
  };
  for (const key of ['version', 'seed', 'focus', 'graph', 'contentScope']) checks[key] = equal(a.chain[key], b.chain[key]);
  // Single completed roots have exactly one prior quote and one recent reading.
  // The reflection is part of that reading and must match byte for byte.
  for (const key of ['sourceId', 'source', 'chapterLabel', 'work', 'corpusVersion', 'textHash',
    'fullText', 'quote', 'quoteStart', 'quoteEnd', 'reflection']) checks[key] = equal(a.parent[key], b.parent[key]);
  const differingFields = Object.keys(checks).filter(key => !checks[key]);
  return { eligible: !differingFields.length, checks, differingFields };
}

function wordSlot(slot, word) {
  const frame = slot.parent;
  const start = frame.quoteStart + frame.quote.indexOf(word);
  const range = classicText.ranges(frame).find(item => item.start === start && item.text === word);
  if (!range || range.start < frame.quoteStart || range.end > frame.quoteEnd) return { word, reason: 'Canonical word range unavailable' };
  const selection = classicText.selectionFor(frame, range);
  const anchor = frame.anchors.some(item => item.surface === 'quote' && item.start + frame.quoteStart === range.start &&
    item.end + frame.quoteStart === range.end);
  return anchor ? { word, selection, reason: 'Existing root quotation anchor' } : { word, selection };
}

function canonicalKey(frame) {
  return [frame.sourceId, frame.corpusVersion, frame.textHash, frame.quoteStart, frame.quoteEnd, frame.quote];
}

function branchEvidence(call, slot, word, corpus, release, cold) {
  const head = event(call, 'head')?.event.chain;
  const frame = event(call, 'frame')?.event.chain;
  const done = event(call, 'done')?.event.chain;
  const start = head?.frames[0], ready = frame?.frames[0], final = done?.frames[0];
  const childOf = chain => chain?.chainId && chain.chainId !== slot.chain.chainId &&
    chain.parentChainId === slot.chain.chainId && chain.entry?.fromFrameId === slot.parent.id &&
    chain.entry.label === word.word && chain.entry.anchorId === 'text:' + word.selection.start + ':' + word.selection.end;
  const relationError = safeCode(errors(call).find(Boolean));
  const passed = call?.status === 200 && call.end && !call.captureFailed && !relationError && childOf(done) &&
    childOf(frame) && frame.chainId === done.chainId && ready?.ready === true && final?.ready === true &&
    isCanonical(final) && equal(ready, final);
  const checkedCorpus = !!final && isCanonical(final) && final.fullText === corpus.get(final.sourceId) && final.corpusVersion === release.corpusVersion;
  const canonicalChildFrame = chain => childOf(chain) && chain.frames?.find(f => f.id !== slot.parent.id &&
    isCanonical(f) && f.fullText === corpus.get(f.sourceId) && f.corpusVersion === release.corpusVersion);
  const first = call?.events.find(({ event: e }) => canonicalChildFrame(e.chain));
  const firstFrame = canonicalChildFrame(first?.event.chain);
  const pure = isCanonical(start) && start.ready === false && !start.settled && start.meaning === '' &&
    start.reflection === '' && start.anchors?.length === 0 && start.reflectionSpans?.length === 0;
  let route = 'unknown';
  if (call?.status === 200 && !cold && !pure && (childOf(first?.event.chain) || relationError === 'RELATION_UNVERIFIED')) route = 'cold';
  const reuseHeadObserved = !!(call?.status === 200 && cold && first?.event.type === 'head' && firstFrame === start &&
    childOf(head) && head.chainId !== cold.childId && pure && start.id !== cold.final.id &&
    equal(canonicalKey(start), canonicalKey(cold.final)));
  const failed = call?.end && !call.captureFailed && relationError === 'RELATION_UNVERIFIED';
  const terminal = call?.events.at(-1)?.event;
  const matchesHead = chain => childOf(chain) && chain.chainId === head.chainId &&
    chain.frames?.[0]?.id === start.id && equal(canonicalKey(chain.frames[0]), canonicalKey(start));
  if (reuseHeadObserved) {
    const completedReuse = passed && checkedCorpus && matchesHead(frame) && matchesHead(done);
    const rejectedReuse = failed && terminal?.type === 'error' && terminal.code === 'RELATION_UNVERIFIED' &&
      terminal.requestId === call.request.requestId && (!frame || matchesHead(frame)) && (!done || matchesHead(done));
    if (completedReuse || rejectedReuse) route = 'reuse';
  }
  return { route, relation: passed ? 'pass' : failed ? 'fail' : 'unknown', reuseHeadObserved,
    relationError, checkedCorpus, first, firstFrame, final, childId: done?.chainId };
}

async function tryBranch(slot, word, report, corpus, cold) {
  const { page, parent, chain } = slot;
  const attempt = { root: slot.label, word: word.word, expectedRoute: cold ? 'reuse' : 'cold', selection: word.selection };
  report.attempts.push(attempt);
  const permit = { op: 'branch', parentId: parent.id, chainId: chain.chainId, selection: word.selection, packs: chain.contentScope.packIds };
  const dispatched = new Promise(done => { permit.signal = done; });
  let armed = false;
  let screenshot;
  let checkpoint = 'restoring root';
  try {
    await page.bringToFront();
    if (await page.evaluate(() => history.state?.flowPathId) !== slot.rootPath) {
      await page.goBack({ timeout: 8000 });
      await page.waitForFunction(path => history.state?.flowPathId === path, slot.rootPath, { timeout: 8000 });
    }
    checkpoint = 'pausing by blank click';
    attempt.blank = await trustedBlank(page);
    checkpoint = 'clicking canonical word';
    const title = '沿「' + word.word + '」接续';
    const button = heading(slot).getByTitle(title, { exact: true }).first();
    await page.evaluate(target => {
      const probe = window.flowPublicProbe;
      probe.target = { ...target, clickIndex: probe.clicks.length };
    }, { parentId: parent.id, word: word.word });
    armed = true;
    slot.permit = permit;
    attempt.pointer = await hitButton(page, button);
    await page.waitForFunction(() => window.flowPublicProbe.clicks.slice(window.flowPublicProbe.target.clickIndex).some(click => click.kind === 'word'),
      null, { timeout: 4000 });
    const deadline = Date.now() + 95000;
    await Promise.race([dispatched, new Promise(done => setTimeout(done, 5000).unref())]);
    if (!permit.sent) throw new Error('Controlled request was blocked');
    await page.evaluate(requestId => { window.flowPublicProbe.target.requestId = requestId; }, permit.requestId);
    checkpoint = 'waiting for first readable quote';
    await page.waitForFunction(() => {
      const p = window.flowPublicProbe, c = p.call();
      return p.target.goAvailable || p.target.visual || c?.end &&
        (c.status !== 200 || !c.events.some(e => e.event.chain?.frames?.length) || performance.now() - c.end > 3000);
    }, null, { timeout: Math.max(1, deadline - Date.now()) }).catch(() => {});
    const shouldGo = await page.evaluate(() => !!window.flowPublicProbe.target.goAvailable && !window.flowPublicProbe.target.visual);
    if (shouldGo && !report.stop) {
      const go = page.locator('[data-flow-arrival]').getByRole('button', { name: '去读', exact: true });
      attempt.goPointer = await hitButton(page, go).catch(() => null);
    }
    checkpoint = 'waiting for settled quote';
    await page.waitForFunction(() => {
      const p = window.flowPublicProbe, c = p.call();
      return p.target.visual || c?.end && (!c.events.some(e => e.event.chain?.frames?.length) || performance.now() - c.end > 4500);
    }, null, { timeout: Math.max(1, deadline - Date.now() + 4500) }).catch(() => {});
    if (await page.evaluate(() => window.flowPublicProbe.target.visual && window.flowPublicProbe.target.currentlyReadable)) {
      screenshot = await page.screenshot({ timeout: 4500 }).catch(() => null);
      const stillReadable = await page.evaluate(() => new Promise(done =>
        requestAnimationFrame(() => done(window.flowPublicProbe.target.currentlyReadable))));
      if (!stillReadable) screenshot = null;
    }
    checkpoint = 'waiting for stream end';
    await page.waitForFunction(() => window.flowPublicProbe.call()?.end,
      null, { timeout: Math.max(1, deadline - Date.now()) }).catch(() => {});
  } catch {
    attempt.interrupted = checkpoint;
  } finally {
    slot.permit = null;
  }
  attempt.sent = !!permit.sent;
  const sample = armed && await page.evaluate(requestId => {
    const p = window.flowPublicProbe;
    return { call: p.calls.find(c => c.request.requestId === requestId), target: p.target, clicks: p.clicks.slice(p.target.clickIndex) };
  }, permit.requestId).catch(() => null);
  const { call, clicks, target } = sample || {};
  if (errors(call).some(limited)) report.stop = 'Production budget or rate limit';
  const result = branchEvidence(call, slot, word, corpus, report.release, cold);
  const click = clicks?.find(item => item.kind === 'word');
  const go = clicks?.find(item => item.kind === 'go');
  attempt.trustedWord = !!click;
  attempt.trustedGo = !!go;
  attempt.status = call?.status;
  attempt.route = click ? result.route : 'unknown';
  if (cold) attempt.reuseHeadObserved = !!click && result.reuseHeadObserved;
  attempt.relation = result.relation;
  attempt.error = result.relationError;
  attempt.checkedCorpus = result.checkedCorpus;
  attempt.events = call?.events.map(({ event: e }) => e.type);
  const visual = target?.visual && result.firstFrame &&
    ['id', 'sourceId', 'corpusVersion', 'textHash', 'quoteStart', 'quoteEnd'].every(key =>
      target.visual[key] === result.firstFrame[key]) ? target.visual : null;
  attempt.geometry = visual?.geometry || target?.lastGeometry;
  if (click) {
    const timing = { request: call?.at, firstQuote: result.first?.at, goAvailable: target?.goAvailable, go: go?.at,
      rawReadable: visual?.at, readableConfirmed: visual?.verifiedAt,
      frame: event(call, 'frame')?.at, done: event(call, 'done')?.at };
    attempt.ms = Object.fromEntries(Object.entries(timing).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [key, value - click.at]));
    if (go && visual && target.goAvailable <= go.at && go.at <= visual.at) {
      attempt.ms.goDwell = go.at - target.goAvailable;
      attempt.ms.readableMinusGoDwell = attempt.ms.rawReadable - attempt.ms.goDwell;
    }
  }
  if (click && visual && screenshot) {
    const name = slot.label + '-' + word.word + '-readable.png';
    await writeFile(resolve(report.output, name), screenshot, { mode: 0o600 })
      .then(() => { attempt.screenshot = name; }).catch(() => {});
  }
  return { result, attempt };
}

function summarize(report) {
  return Object.fromEntries(['cold', 'reuse'].map(route => {
    const sent = report.attempts.filter(item => item.sent && item.expectedRoute === route);
    const confirmed = sent.filter(item => item.route === route);
    const times = confirmed.flatMap(item => Number.isFinite(item.ms?.rawReadable) ? [item.ms.rawReadable] : []).sort((a, b) => a - b);
    return [route, { sent: sent.length, confirmed: confirmed.length, unverified: sent.length - confirmed.length, timed: times.length,
      final: Object.fromEntries(['pass', 'fail', 'unknown'].map(outcome => [outcome, confirmed.filter(item => item.relation === outcome).length])),
      p50: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null,
      range: times.length ? [times[0], times.at(-1)] : null }];
  }));
}

const blindFrame = frame => ({ source: frame.source, chapter: frame.chapterLabel, quote: frame.quote, reflection: frame.reflection });

async function liveRun(report, corpus) {
  const blind = [];
  const browser = await chromium.launch({ headless: false });
  try {
    const a = await browserSlot(browser, undefined, report, 'A');
    await openRoot(a, report);
    if (report.stop || !a.owner) return;
    let b;
    if (!report.coldOnly) {
      b = await browserSlot(browser, a.owner, report, 'B');
      await openRoot(b, report);
      report.comparison = compareRoots(a, b);
      if (report.stop) return;
    }
    const root = a.rootPath ? a : b?.rootPath ? b : null;
    if (!root) return;
    report.candidates = (report.coldOnly ? ['静'] : candidates).map(word => wordSlot(root, word));
    const planned = [];
    // Resolve ordinary canonical buttons before dispatch; reserves may fill only
    // slots that could not start, never retry an operation sent to production.
    for (const word of report.candidates) {
      if (word.reason) continue;
      if (!await heading(root).getByTitle('沿「' + word.word + '」接续', { exact: true }).count()) word.reason = 'Word button missing';
      else planned.push(word);
    }
    const completed = [];
    const collect = (slot, word, output) => {
      if (!output.attempt.sent || !output.result.final) return;
      blind.push({ id: 'CASE-' + (blind.length + 1), word: word.word, from: blindFrame(slot.parent),
        to: { ...blindFrame(output.result.final), meaning: output.result.final.meaning } });
    };
    for (const word of planned) {
      if (report.stop || report.sent.branch >= (report.coldOnly ? 1 : 2)) break;
      const output = await tryBranch(root, word, report, corpus);
      collect(root, word, output);
      if (output.attempt.route === 'cold' && output.result.relation === 'pass' && output.result.checkedCorpus) completed.push({ word, ...output.result });
    }
    report.reuse = { eligible: 0 };
    if (report.coldOnly) {
      report.reuse.reason = 'Cold-only run';
      return;
    }
    if (!report.comparison.eligible || root !== a) {
      report.reuse.reason = 'Root signatures differ or are unavailable';
      return;
    }
    for (const cold of completed) {
      if (report.stop) break;
      const word = wordSlot(b, cold.word.word);
      if (word.reason || !equal(word.selection, cold.word.selection)) continue;
      report.reuse.eligible++;
      const output = await tryBranch(b, word, report, corpus, cold);
      collect(b, word, output);
    }
    if (!report.reuse.eligible) report.reuse.reason = 'No verified cold branch with matching second-root selection';
  } finally {
    await browser.close();
    // Blind-review inputs intentionally omit route, timing, and outcome.
    await writeFile(resolve(report.output, 'blind.json'), JSON.stringify(blind, null, 2) + '\n', { mode: 0o600 });
  }
}

async function main() {
  const config = options();
  if (config.help) {
    console.log('Dry: node scripts/probe-flow-public.mjs [--commit <git-sha>] [--release <release-id>] [--entry-sha <sha256>] [--output <new-dir>]');
    console.log('Live: add --live and supply all four options. Chromium uses a foreground 390 × 844 viewport.');
    console.log('Add --cold-only to limit a live run to one fresh root and one cold 静 branch.');
    return;
  }
  const release = await verifyRelease(config);
  const coldOnly = config['cold-only'];
  const report = { mode: config.live ? 'live' : 'dry', coldOnly, release, viewport: { ...viewport, dpr: 3 },
    caps: coldOnly ? { open: 1, branch: 1 } : caps, sent: { session: 0, open: 0, branch: 0 },
    roots: {}, attempts: [], blocked: {}, started: new Date().toISOString(), output: config.output };
  if (config.output) await mkdir(config.output, { mode: 0o700 });
  try {
    if (config.live) {
      const corpus = loadCorpus(release);
      await writeFile(resolve(config.output, 'run.lock'), 'Production probe started\n', { flag: 'wx', mode: 0o600 });
      await liveRun(report, corpus);
    }
  } catch {
    report.stop ??= 'Corpus, browser, or evidence operation failed';
    process.exitCode = 1;
  } finally {
    report.finished = new Date().toISOString();
    report.summary = summarize(report);
    if (config.live && !report.reuse) report.reuse = { eligible: 0, reason: report.stop || 'Complete comparable roots unavailable' };
    delete report.output;
    const json = JSON.stringify(report, null, 2) + '\n';
    if (config.output) {
      const output = resolve(config.output, 'result.json');
      await writeFile(output, json, { mode: 0o600 });
      console.log('Saved ' + output);
    } else process.stdout.write(json);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
