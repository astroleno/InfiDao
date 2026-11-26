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
const seedSourceId = 'rysxguji-daxue-1-2';
const candidates = ['静', '止', '得', '定'];
const ownerName = '__Host-infidao_flow';
const viewport = { width: 390, height: 844 };
const caps = { open: 2, branch: 4 };
const postDoneMs = 1000;
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
    'entry-sha': { type: 'string' }, 'cold-only': { type: 'boolean' }, cohort: { type: 'string' },
    output: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) return values;
  if (values['cold-only'] && !values.live) throw new Error('--cold-only requires --live');
  if (values.cohort !== undefined && (!values.live || values['cold-only'] || !/^(?:1[0-9]|20)$/.test(values.cohort))) {
    throw new Error('--cohort requires --live and a size from 10 to 20, and replaces --cold-only');
  }
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
    corpusVersion: manifest.corpusVersion, corpusSha256: manifest.corpusSha256,
    ...(manifest.classicalDisplaySha256 ? { classicalDisplaySha256: manifest.classicalDisplaySha256 } : {}) };
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

const displayProjections = new Map();
function loadDisplayProjection(release) {
  if (!release.classicalDisplaySha256) return null;
  const key = release.commit + ':' + release.classicalDisplaySha256;
  if (!displayProjections.has(key)) {
    const source = gitFile(release.commit, 'src/lib/flow-browser/classic-display-projector.cjs');
    const data = gitFile(release.commit, 'src/lib/flow-browser/classic-display.generated.json');
    const digest = createHash('sha256').update(source).update(data).digest('hex');
    if (release.classicalDisplaySha256 !== digest) throw new Error('Display projection did not match the verified release');
    displayProjections.set(key, { source: source.toString(), data: JSON.parse(data) });
  }
  return displayProjections.get(key);
}

export function browserProbeScript(settleMs, projection) {
  return `(() => {
    const module = { exports: {} };
    ${projection?.source || ''}
    (${instrument.toString()})(${settleMs}, ${projection ? `module.exports.createClassicProjector(${JSON.stringify(projection.data)})` : 'null'});
  })();`;
}

// This function is serialized into each isolated browser context. Raw response
// records stay in memory so opaque request and chain IDs never reach disk.
function instrument(settleMs, projectDisplay = null) {
  const probe = window.flowPublicProbe = { calls: [], clicks: [], target: null };
  probe.displayWord = ({ fullText, start, end, word }) => projectDisplay?.(fullText)?.slice(start, end) ?? word;
  probe.matchesWord = (button, target) => {
    const displayed = button.textContent.trim();
    const canonical = projectDisplay ? button.dataset.flowSourceText ?? displayed : displayed;
    return canonical === target.word && displayed === target.displayWord &&
      (!projectDisplay || button.dataset.flowAnchorId === target.anchorId);
  };
  const clock = () => performance.now();
  const boundsOf = panel => {
    const rect = panel.getBoundingClientRect();
    const view = window.visualViewport;
    return {
      top: Math.max(rect.top, view?.offsetTop ?? 0),
      bottom: Math.min(rect.bottom, (view?.offsetTop ?? 0) + (view?.height ?? innerHeight)),
      left: Math.max(rect.left, view?.offsetLeft ?? 0),
      right: Math.min(rect.right, (view?.offsetLeft ?? 0) + (view?.width ?? innerWidth)),
    };
  };
  const overlaps = (a, b, clip) => Math.max(a.left, b.left, clip.left) < Math.min(a.right, b.right, clip.right) &&
    Math.max(a.top, b.top, clip.top) < Math.min(a.bottom, b.bottom, clip.bottom);
  const displayed = el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const hitTestable = el => {
    if (!el || !displayed(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && el.contains(document.elementFromPoint(
      rect.left + rect.width / 2, rect.top + rect.height / 2,
    ));
  };
  function hintState(panel, bounds, heading) {
    const button = [...panel.parentElement.querySelectorAll(':scope > div > button')]
      .find(el => el.textContent.trim() === '知道了');
    const container = button?.parentElement;
    const rect = container?.getBoundingClientRect();
    const visible = !!rect && displayed(container) && displayed(button) && overlaps(rect, bounds, bounds);
    return { present: !!button, visible, hitTestable: visible && hitTestable(button),
      obstructs: visible && !!heading && displayed(heading) && overlaps(rect, heading.getBoundingClientRect(), bounds) };
  }
  probe.hint = () => {
    const panel = document.querySelector('[data-flow-viewport]');
    return panel && { at: clock(), ...hintState(panel, boundsOf(panel)) };
  };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.href, location.href);
    if (url.origin !== location.origin || init?.method !== 'POST' ||
        !['/api/flow', '/api/flow/session'].includes(url.pathname)) return original(input, init);
    const request = JSON.parse(init.body);
    const target = probe.target;
    if (target?.clickedAt !== undefined && request.op === 'branch' && !request.prefetch &&
        request.chainId === target.chainId && request.fromFrameId === target.parentId && request.anchorId === target.anchorId) {
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
          if (event.requestId === request.requestId) call.events.push({ at: clock(), event });
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
    const at = clock();
    if (button?.textContent.trim() === '知道了') probe.clicks.push({ kind: 'hint', at, trusted: true });
    else if (target && parent?.dataset.flowFrame === target.parentId && button.closest('[data-flow-heading]') &&
        probe.matchesWord(button, target) && (target.buttonIndex === undefined ||
          [...button.closest('[data-flow-heading]').querySelectorAll('button')][target.buttonIndex] === button)) {
      target.clickedAt ??= at;
      target.hintAtClick ??= probe.hint();
      probe.clicks.push({ kind: 'word', at, trusted: true });
    } else if (target && button?.closest('[data-flow-arrival]') && button.textContent.trim() === '去读') {
      probe.clicks.push({ kind: 'go', at, trusted: true });
    } else if (el.closest?.('[data-flow-viewport]') && !el.closest('[data-flow-frame], button, a, input, textarea')) {
      probe.clicks.push({ kind: 'blank', at, trusted: true });
    }
  }, true);

  probe.call = () => probe.target && probe.calls.find(call => call.request.requestId === probe.target.requestId);
  const frameKey = frame => ({ id: frame.id, sourceId: frame.sourceId, corpusVersion: frame.corpusVersion,
    textHash: frame.textHash, quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd });
  function trackHint(target, frame, state, source, terminal, settled, now) {
    const audit = target.hintAudit ??= {
      ...frameKey(frame), firstAt: now, lastAt: now, samples: { frame: 0, mutation: 0 },
      present: { ticks: 0, episodes: 0, ended: 0 }, visible: { ticks: 0, episodes: 0, ended: 0 },
      overlap: { ticks: 0, episodes: 0, ended: 0 }, postTerminal: { frame: 0, mutation: 0 },
    };
    audit.samples[source]++;
    audit.lastAt = now;
    for (const [kind, active] of Object.entries({ present: state.present, visible: state.visible, overlap: state.obstructs })) {
      const tally = audit[kind];
      if (active) {
        tally.ticks++;
        tally.firstAt ??= now;
        tally.lastAt = now;
        if (!tally.active) tally.episodes++;
      } else if (tally.active) tally.ended++;
      tally.active = active;
    }
    if (terminal) {
      audit.terminalAt = terminal.at;
      audit.terminal = terminal.event.type;
      audit.postTerminal[source]++;
      if (settled) audit.settledSince ??= now;
      else {
        delete audit.settledSince;
        delete audit.confirmedAt;
      }
      if (Number.isFinite(audit.settledSince) && now - Math.max(audit.settledSince, terminal.at) >= settleMs &&
          audit.postTerminal.frame > 1) audit.confirmedAt = now;
    }
  }

  function sample(source) {
    const target = probe.target;
    const call = probe.call();
    if (!target || !call) return;
    if (source === 'frame') target.currentlyReadable = false;
    const terminal = call.events.find(({ event }) => event.type === 'done' || event.type === 'error');
    const frame = target.canonicalFrame ??= call.events.map(({ event: { chain } }) =>
      chain?.chainId !== target.chainId && chain?.parentChainId === target.chainId &&
      chain?.entry?.fromFrameId === target.parentId && chain.entry.anchorId === target.anchorId &&
      chain.entry.label === target.word ? chain.frames[0] : null).find(f => f && f.id !== target.parentId &&
      typeof f.fullText === 'string' && f.quote && Number.isInteger(f.quoteStart) && f.quoteStart >= 0 &&
      f.quoteEnd === f.quoteStart + f.quote.length && f.fullText.slice(f.quoteStart, f.quoteEnd) === f.quote);
    if (!frame) return;
    const dock = [...document.querySelectorAll('[data-flow-arrival] button')].find(el => el.textContent.trim() === '去读');
    if (hitTestable(dock)) target.goAvailable ??= clock();
    const panel = document.querySelector('[data-flow-viewport]');
    if (!panel) return;
    const articles = [...panel.querySelectorAll('[data-flow-frame]')].filter(el => el.dataset.flowFrame === frame.id);
    const article = articles.length === 1 ? articles[0] : null;
    const heading = article?.querySelector('[data-flow-heading]');
    // Optical token groups contain exactly the quote, without the hidden keyboard help.
    const optics = heading ? [...heading.querySelectorAll('[data-flow-optic]')] : [];
    const displayQuote = projectDisplay
      ? (target.displayQuote ??= projectDisplay(frame.fullText)?.slice(frame.quoteStart, frame.quoteEnd) ?? frame.quote)
      : frame.quote;
    const exact = heading && optics.map(el => el.textContent).join('') === displayQuote;
    const bounds = boundsOf(panel);
    const hint = hintState(panel, bounds, exact ? heading : null);
    const ink = heading?.dataset.inkPhase;
    const settledInk = ink === 'settled' && !heading.querySelector('[data-flow-ink], [data-flow-bent]');
    if (!target.cohort && (exact || target.hintAudit)) {
      const settled = panel.parentElement.dataset.pending === 'false' && (terminal?.event.type === 'error' ||
        !!exact && article.dataset.flowReady === 'true' && settledInk && displayed(heading));
      trackHint(target, frame, hint, source, terminal, settled, clock());
    }
    if (source !== 'frame') return;
    if (!exact) {
      target.previous = null;
      return;
    }

    const rect = heading.getBoundingClientRect();
    const overlays = [...document.querySelectorAll('[data-flow-arrival], [data-flow-tools], [data-phase][data-has-quote]')];
    const obstructed = hint.obstructs || overlays.some(el => displayed(el) && overlaps(rect, el.getBoundingClientRect(), bounds));
    const geometry = { edges: [rect.top, rect.bottom, rect.left, rect.right], bounds, ink, obstructed,
      hintVisible: hint.visible, hintObstructed: hint.obstructs };
    if (target.cohort && settledInk) {
      const range = document.createRange();
      const glyphs = [];
      let shown = true;
      for (const optic of optics) {
        const nodes = document.createTreeWalker(optic, NodeFilter.SHOW_TEXT);
        for (let node = nodes.nextNode(); node; node = nodes.nextNode()) {
          const nodeStyle = getComputedStyle(node.parentElement);
          const opticStyle = getComputedStyle(optic);
          let offset = 0;
          for (const glyph of node.textContent) {
            range.setStart(node, offset);
            offset += glyph.length;
            range.setEnd(node, offset);
            if (/\s/u.test(glyph)) continue;
            const box = range.getBoundingClientRect();
            glyphs.push(box.top, box.bottom, box.left, box.right);
            shown &&= displayed(node.parentElement) && Number(opticStyle.opacity) >= 0.8 &&
              Number(nodeStyle.opacity) >= 0.8 && box.width > 0 && box.height > 0 &&
              box.top >= bounds.top && box.bottom <= bounds.bottom && box.left >= bounds.left && box.right <= bounds.right;
          }
        }
      }
      geometry.glyphs = { count: glyphs.length / 4, visible: shown && glyphs.length > 0 };
      geometry.edges.push(...glyphs);
    }
    target.lastGeometry = geometry;
    const visible = rect.width > 0 && rect.height > 0 && rect.top >= bounds.top && rect.bottom <= bounds.bottom &&
      rect.left >= bounds.left && rect.right <= bounds.right && !obstructed && settledInk && displayed(heading) &&
      (!target.cohort || geometry.glyphs?.visible);
    target.currentlyReadable = visible;
    if (target.visual) return;
    if (!visible) {
      target.previous = null;
      return;
    }
    if (target.previous?.id === frame.id && geometry.edges.every((value, index) => Math.abs(value - target.previous.geometry.edges[index]) < 0.5)) {
      const { edges, ...readable } = target.previous.geometry;
      target.visual = { ...target.previous, geometry: { ...readable, edges: edges.slice(0, 4) }, verifiedAt: clock() };
    } else target.previous = {
      ...frameKey(frame), at: clock(), geometry,
    };
  }
  const observer = new MutationObserver(() => sample('mutation'));
  let observedStream;
  function animate() {
    requestAnimationFrame(animate);
    const stream = document.querySelector('[data-flow-stream]');
    if (stream !== observedStream) {
      observer.disconnect();
      if (stream) observer.observe(stream, { childList: true });
      observedStream = stream;
    }
    sample('frame');
  }
  requestAnimationFrame(animate);
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
  const projection = loadDisplayProjection(report.release);
  if (projection) await page.addInitScript({ content: browserProbeScript(postDoneMs, projection) });
  else await page.addInitScript(instrument, postDoneMs);
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
    // Before pausing the moving root, give its opening reveal a chance to
    // expose the hint. An absent hint makes the hint trial inconclusive.
    if (!report.cohort) {
      await page.waitForFunction(() => window.flowPublicProbe.hint()?.hitTestable,
        null, { timeout: 12000 }).catch(() => {});
    }
    result.beforeBlank = await page.evaluate(() => {
      const panel = document.querySelector('[data-flow-viewport]');
      const stream = panel?.parentElement;
      const loading = document.querySelector('[data-phase][data-has-quote]');
      return { hint: window.flowPublicProbe.hint(), pending: stream?.dataset.pending, paused: stream?.dataset.paused,
        rising: panel?.hasAttribute('data-flow-rising'), loadingHidden: loading?.getAttribute('aria-hidden') };
    });
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

function freezeCohort(size, corpus, release) {
  const text = corpus.get(seedSourceId);
  if (text !== seedQuote) throw new Error('Published root text differs from the cohort source');
  const lexicalBreaks = [...new Intl.Segmenter('zh-Hans', { granularity: 'word' }).segment(text)]
    .map(part => part.index + part.segment.length);
  const frame = { fullText: text, corpusVersion: release.corpusVersion, textHash: sha(text), lexicalBreaks };
  const ranges = classicText.ranges(frame);
  if (ranges.length < size) throw new Error('Insufficient distinct eligible lexical positions');
  return Array.from({ length: size }, (_, index) => {
    const buttonIndex = Math.round(index * (ranges.length - 1) / (size - 1));
    const range = ranges[buttonIndex];
    return { id: 'P' + (index + 1), word: range.text, buttonIndex, build: release.commit, pack: 'core',
      sourceId: seedSourceId, field: 'quote', selection: classicText.selectionFor(frame, range) };
  });
}

function canonicalKey(frame) {
  return [frame.sourceId, frame.corpusVersion, frame.textHash, frame.quoteStart ?? frame.start, frame.quoteEnd ?? frame.end, frame.quote];
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
  const passed = call?.status === 200 && call.end && !call.captureFailed && !relationError && call.events.at(-1)?.event.type === 'done' && childOf(done) &&
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
  return { route, relation: passed && checkedCorpus ? 'pass' : failed ? 'fail' : 'unknown', reuseHeadObserved,
    relationError, checkedCorpus, first, firstFrame, final, childId: done?.chainId };
}

const frameMatches = (sample, frame) => sample && frame &&
  ['id', 'sourceId', 'corpusVersion', 'textHash', 'quoteStart', 'quoteEnd'].every(key => sample[key] === frame[key]);

function hintEvidence(audit, click) {
  const relative = at => Number.isFinite(at) ? at - click.at : null;
  const counts = tally => ({ ticks: tally.ticks, episodes: tally.episodes, ended: tally.ended,
    reappearances: Math.max(0, tally.episodes - 1), firstMs: relative(tally.firstAt), lastMs: relative(tally.lastAt) });
  return { samples: audit.samples, firstMs: relative(audit.firstAt), lastMs: relative(audit.lastAt),
    present: counts(audit.present), visible: counts(audit.visible), overlap: counts(audit.overlap),
    flashes: audit.visible.ended, terminal: audit.terminal ?? null, terminalMs: relative(audit.terminalAt),
    postTerminalSamples: audit.postTerminal, settledSinceMs: relative(audit.settledSince),
    settledConfirmedMs: relative(audit.confirmedAt), postTerminalMs: audit.lastAt - audit.terminalAt || null };
}

function canonicalButton(slot, word, cohort, projected) {
  const buttons = heading(slot);
  if (cohort) return buttons.locator('button').nth(word.buttonIndex);
  if (projected) return buttons.locator(`button[data-flow-anchor-id="text:${word.selection.start}:${word.selection.end}"]`);
  return buttons.getByTitle('沿「' + word.word + '」接续', { exact: true }).first();
}

async function verifyWordButton(slot, word, button) {
  const { start, end } = word.selection;
  const target = await slot.page.evaluate(({ fullText, start, end, word }) => ({
    word, anchorId: 'text:' + start + ':' + end,
    displayWord: window.flowPublicProbe.displayWord({ fullText, start, end, word }),
  }), { fullText: slot.parent.fullText, start, end, word: word.word });
  const verified = await button.evaluate((element, target) => window.flowPublicProbe.matchesWord(element, target), target);
  return verified ? target : null;
}

async function tryBranch(slot, word, report, corpus, cold) {
  const { page, parent, chain } = slot;
  const attempt = { root: slot.label, word: word.word, expectedRoute: cold ? 'reuse' : 'cold', selection: word.selection };
  if (word.id) attempt.position = word.id;
  report.attempts.push(attempt);
  const permit = { op: 'branch', parentId: parent.id, chainId: chain.chainId, selection: word.selection, packs: chain.contentScope.packIds };
  const dispatched = new Promise(done => { permit.signal = done; });
  let armed = false;
  let screenshot;
  let rootHintScreenshot;
  let postDoneScreenshot;
  let checkpoint = 'restoring root';
  try {
    await page.bringToFront();
    if (await page.evaluate(() => history.state?.flowPathId) !== slot.rootPath) {
      await page.goBack({ timeout: 8000 });
      await page.waitForFunction(path => history.state?.flowPathId === path, slot.rootPath, { timeout: 8000 });
    }
    const fresh = !slot.hasSentWord;
    if (!report.cohort && fresh && await page.evaluate(() => window.flowPublicProbe.hint()?.hitTestable)) {
      rootHintScreenshot = await page.screenshot({ timeout: 4500 }).catch(() => null);
    }
    checkpoint = 'pausing by blank click';
    attempt.blank = report.cohort ? report.roots[slot.label].blank : await trustedBlank(page);
    attempt.hintBeforeWord = { expected: fresh ? 'visible' : 'dismissed', ...await page.evaluate(() => {
      const { at, ...state } = window.flowPublicProbe.hint() || {};
      return state;
    }) };
    checkpoint = 'clicking canonical word';
    const button = canonicalButton(slot, word, report.cohort, report.release.classicalDisplaySha256);
    await button.waitFor({ state: 'attached', timeout: 4500 });
    const target = await verifyWordButton(slot, word, button);
    if (!target) throw new Error('Canonical word position changed');
    await page.evaluate(target => {
      const probe = window.flowPublicProbe;
      probe.target = { ...target, clickIndex: probe.clicks.length };
    }, { ...target, parentId: parent.id, chainId: chain.chainId,
      buttonIndex: word.buttonIndex, cohort: !!report.cohort });
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
    checkpoint = 'observing hint after stream terminal';
    const terminal = await page.evaluate(() => window.flowPublicProbe.call()?.events
      .find(({ event }) => event.type === 'done' || event.type === 'error')?.event.type);
    if (terminal && !report.cohort) {
      await page.waitForFunction(() => {
        const probe = window.flowPublicProbe;
        const audit = probe.target.hintAudit;
        return audit?.confirmedAt || probe.call()?.end && !probe.target.canonicalFrame;
      }, null, { timeout: 10000 }).catch(() => {});
      if (terminal === 'done' && await page.evaluate(() => !!window.flowPublicProbe.target.hintAudit?.confirmedAt)) {
        postDoneScreenshot = await page.screenshot({ timeout: 4500 }).catch(() => null);
      }
    }
  } catch {
    attempt.interrupted = checkpoint;
  } finally {
    slot.permit = null;
  }
  attempt.sent = !!permit.sent;
  slot.hasSentWord ||= attempt.sent;
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
  const describe = frame => frame && { sourceId: frame.sourceId, source: frame.source, chapter: frame.chapterLabel,
    corpusVersion: frame.corpusVersion, textHash: frame.textHash, start: frame.quoteStart, end: frame.quoteEnd, quote: frame.quote };
  attempt.first = describe(result.firstFrame);
  attempt.firstEvent = result.first?.event.type;
  attempt.final = describe(result.final);
  const visual = frameMatches(target?.visual, result.firstFrame) ? target.visual : null;
  if (click && target.hintAtClick) {
    const { at, ...state } = target.hintAtClick;
    attempt.hintAtTrustedWord = state;
  }
  attempt.trustedHintClicks = clicks?.filter(item => item.kind === 'hint').length || 0;
  if (click && frameMatches(target?.hintAudit, result.firstFrame)) {
    attempt.hintAfterArrival = hintEvidence(target.hintAudit, click);
  }
  attempt.hintCovered = !!(click && (attempt.hintBeforeWord?.expected === 'visible'
    ? attempt.hintAtTrustedWord?.hitTestable : attempt.hintAtTrustedWord?.present === false) &&
    attempt.trustedHintClicks === 0 && attempt.hintAfterArrival?.terminal === 'done' &&
    attempt.hintAfterArrival.settledConfirmedMs !== null);
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
  if (attempt.hintAtTrustedWord?.hitTestable && rootHintScreenshot) {
    const name = slot.label + '-' + word.word + '-fresh-hint.png';
    await writeFile(resolve(report.output, name), rootHintScreenshot, { mode: 0o600 });
    attempt.freshHintScreenshot = name;
  }
  if (attempt.hintAfterArrival?.terminal === 'done' && attempt.hintAfterArrival.settledConfirmedMs !== null && postDoneScreenshot) {
    const name = slot.label + '-' + word.word + '-post-done.png';
    await writeFile(resolve(report.output, name), postDoneScreenshot, { mode: 0o600 });
    attempt.postDoneScreenshot = name;
  }
  return { result, attempt };
}

export function summarize(report) {
  return Object.fromEntries(['cold', 'reuse'].map(route => {
    const sent = report.attempts.filter(item => item.sent && item.expectedRoute === route);
    const confirmed = sent.filter(item => item.route === route);
    const readableEligible = confirmed.filter(item => item.relation === 'pass' && item.first && item.final &&
      equal(canonicalKey(item.first), canonicalKey(item.final)));
    const times = readableEligible.flatMap(item => Number.isFinite(item.ms?.rawReadable) ? [item.ms.rawReadable] : []).sort((a, b) => a - b);
    return [route, { sent: sent.length, confirmed: confirmed.length, unverified: sent.length - confirmed.length,
      readableEligible: readableEligible.length, timed: times.length,
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
    if (report.cohort) {
      for (const word of report.cohort) {
        if (report.stop) break;
        const slot = await browserSlot(browser, undefined, report, word.id);
        try {
          await openRoot(slot, report);
          if (report.stop || !slot.rootPath) continue;
          const range = classicText.ranges(slot.parent)[word.buttonIndex];
          const anchor = slot.parent.anchors.some(item => item.surface === 'quote' &&
            item.start + slot.parent.quoteStart === range?.start && item.end + slot.parent.quoteStart === range?.end);
          if (slot.parent.sourceId !== word.sourceId || slot.parent.quoteStart !== 0 || slot.parent.quoteEnd !== seedQuote.length ||
              slot.chain.contentScope.versions.core !== word.selection.corpusVersion || !range || range.text !== word.word ||
              !equal(classicText.selectionFor(slot.parent, range), word.selection) || anchor) {
            report.roots[word.id].ineligible = 'Frozen quote position could not be matched as an unprepared root word';
            continue;
          }
          const { result } = await tryBranch(slot, word, report, corpus);
          if (result.final) blind.push({ id: word.id, word: word.word, from: blindFrame(slot.parent),
            to: { ...blindFrame(result.final), meaning: result.final.meaning } });
        } finally {
          await slot.context.close();
        }
      }
      return;
    }
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
      const button = canonicalButton(root, word, false, report.release.classicalDisplaySha256);
      if (!await button.count() || !await verifyWordButton(root, word, button)) word.reason = 'Word button missing';
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
    console.log('Add --cohort <10-20> to predeclare distinct cold positions and test each in a fresh anonymous context.');
    return;
  }
  const release = await verifyRelease(config);
  const coldOnly = config['cold-only'];
  const cohortSize = Number(config.cohort) || 0;
  const report = { mode: config.live ? 'live' : 'dry', coldOnly, release, viewport: { ...viewport, dpr: 3 },
    caps: cohortSize ? { open: cohortSize, branch: cohortSize } : coldOnly ? { open: 1, branch: 1 } : caps,
    sent: { session: 0, open: 0, branch: 0 },
    roots: {}, attempts: [], blocked: {}, started: new Date().toISOString(), output: config.output };
  if (config.output) await mkdir(config.output, { mode: 0o700 });
  try {
    if (config.live) {
      const corpus = loadCorpus(release);
      if (cohortSize) {
        report.cohort = freezeCohort(cohortSize, corpus, release);
        const frozen = JSON.stringify(report.cohort, null, 2) + '\n';
        report.cohortSha256 = sha(frozen);
        await writeFile(resolve(config.output, 'cohort.json'), frozen, { flag: 'wx', mode: 0o600 });
      }
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
