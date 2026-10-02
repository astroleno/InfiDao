type FontAsset = { id: string; file: string; bytes: number; sha256: string };
type FontShard = FontAsset & { characters: string };
type FontManifest = { version: string; shards: FontShard[]; unsupported?: string; baseCharacters?: string; baseFonts?: Array<FontAsset & { family: string }> };
type FontReady = { version: string; family: string; families: string[]; characters: string };
import { FLOW_RELEASE } from './release.generated';
import { FLOW_FONT_BASE, FLOW_FONT_CDN_BASE, FLOW_FONT_LOCAL_BASE } from './font-assets';

const { installFont, hasGlyph, installBaseFonts } = require('./glyph-outline') as {
  installFont: (id: string, characters: string, data: ArrayBuffer) => void;
  hasGlyph: (char: string) => boolean;
  installBaseFonts: (data: ArrayBuffer[], characters: string) => void;
};

const manifests = new Map<string, Promise<{ manifest: FontManifest; baseUrl: string }>>();
const loadedFaces = new Map<string, Promise<void>>();
const loadedShards = new Map<string, Promise<ArrayBuffer>>();
const loadedBases = new Map<string, Promise<string[]>>();
const localBase = FLOW_FONT_LOCAL_BASE;
const cdnBase = FLOW_FONT_CDN_BASE;
const preferredBase = FLOW_FONT_BASE;
let activeDownloads = 0;
const downloadQueue: Array<() => void> = [];
const ASSET_TIMEOUT_MS = 8_000;

// Include body consumption in the deadline: receiving headers alone does not
// mean a font has arrived. A stalled CDN must release its download slot.
async function fetchAsset<T>(url: string, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS);
  try {
    return await read(await fetch(url, { cache: 'force-cache', signal: controller.signal }));
  } catch (error) {
    if (controller.signal.aborted) throw new Error('FONT_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

// Bound total shard downloads across simultaneous chain preparations, not only
// within one caller. The promise cache still deduplicates the same shard.
function download<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeDownloads++;
      void Promise.resolve().then(work).then(resolve, reject).finally(() => {
        activeDownloads--;
        downloadQueue.shift()?.();
      });
    };
    if (activeDownloads < 3) run();
    else downloadQueue.push(run);
  });
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function loadManifest(baseUrl: string): Promise<{ manifest: FontManifest; baseUrl: string }> {
  if (!manifests.has(baseUrl)) {
    const pending = fetchAsset(`${baseUrl}/manifest.json`, async response => {
        if (!response.ok) throw new Error('FONT_MANIFEST_UNAVAILABLE');
        const manifest = await response.json() as FontManifest;
        if ((baseUrl === localBase || baseUrl === cdnBase) && manifest.version !== FLOW_RELEASE.fontVersion) throw new Error('FONT_VERSION_CHANGED');
        return { manifest, baseUrl };
      }).catch(error => {
        manifests.delete(baseUrl);
        if (baseUrl === cdnBase && cdnBase !== localBase) return loadManifest(localBase);
        throw error;
      });
    manifests.set(baseUrl, pending);
  }
  return manifests.get(baseUrl)!;
}

async function registerFace(family: string, data: ArrayBuffer): Promise<void> {
  const key = family;
  if (loadedFaces.has(key)) return loadedFaces.get(key)!;
  const pending = (async () => {
    const face = new FontFace(family, data, { style: 'normal', weight: '400' });
    await face.load();
    document.fonts.add(face);
  })();
  loadedFaces.set(key, pending);
  pending.catch(() => loadedFaces.delete(key));
  return pending;
}

function loadFontAsset(asset: FontAsset, baseUrl: string): Promise<ArrayBuffer> {
  const key = `${baseUrl}/${asset.file}:${asset.sha256}:${asset.bytes}`;
  if (!loadedShards.has(key)) {
    const pending = download(async () => {
      const locations = baseUrl === cdnBase && cdnBase !== localBase ? [baseUrl, localBase] : [baseUrl];
      let failure: unknown;
      for (const location of locations) try {
        const buffer = await fetchAsset(`${location}/${asset.file}`, async response => {
          if (!response.ok) throw new Error('FONT_UNAVAILABLE');
          return response.arrayBuffer();
        });
        if (buffer.byteLength !== asset.bytes) throw new Error('FONT_INCOMPLETE');
        if (!globalThis.crypto?.subtle) throw new Error('FONT_INTEGRITY_UNAVAILABLE');
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        if (hex(digest) !== asset.sha256) throw new Error('FONT_INTEGRITY');
        return buffer;
      } catch (error) { failure = error; }
      throw failure;
    }).catch(error => { loadedShards.delete(key); throw error; });
    loadedShards.set(key, pending);
  }
  return loadedShards.get(key)!;
}

function prepareBaseFonts(manifest: FontManifest, baseUrl: string): Promise<string[]> {
  const fonts = manifest.baseFonts || [];
  if (!fonts.length) return Promise.resolve([]);
  const key = manifest.version;
  if (!loadedBases.has(key)) {
    const pending = (async () => {
      const buffers = await Promise.all(fonts.map(font => loadFontAsset(font, baseUrl)));
      await Promise.all(fonts.map((font, index) => registerFace(font.family, buffers[index]!)));
      // Keep native precedence (serif, supplement), including overlapping glyphs.
      installBaseFonts(buffers, manifest.baseCharacters || '');
      return fonts.map(font => font.family);
    })().catch(error => { loadedBases.delete(key); throw error; });
    loadedBases.set(key, pending);
  }
  return loadedBases.get(key)!;
}

export async function prepareFlowFonts(frames: Array<{ quote: string; fullText?: string }>, baseUrl = preferredBase): Promise<FontReady> {
  baseUrl = baseUrl.replace(/\/$/, '');
  const text = Array.from(new Set(frames.flatMap(frame => Array.from(`${frame.quote}${frame.fullText || frame.quote}`)))).join('');
  const loaded = await loadManifest(baseUrl);
  const { manifest } = loaded;
  // A manifest fallback also chooses the origin for its shards. Do not send
  // every shard back to a CDN which has already failed this preparation.
  baseUrl = loaded.baseUrl;
  const supported = new Set([...Array.from(manifest.baseCharacters || ''), ...manifest.shards.flatMap(shard => Array.from(shard.characters))]);
  const missing = Array.from(new Set(Array.from(text).filter(char => !supported.has(char) && !hasGlyph(char))));
  if (missing.length) throw new Error('FONT_UNCOVERED');

  const baseCoverage = new Set(Array.from(manifest.baseCharacters || ''));
  const extraCharacters = new Set(Array.from(text).filter(char => !baseCoverage.has(char)));
  const needed = manifest.shards.filter(shard => Array.from(shard.characters).some(char => extraCharacters.has(char)));
  // Schedule the two base faces first within the same global download cap.
  const basesReady = prepareBaseFonts(manifest, baseUrl);
  const shardsReady = Promise.all(needed.map(async shard => {
    const family = `InfiDao-${shard.id}-${shard.sha256}`;
    const buffer = await loadFontAsset(shard, baseUrl);
    // Every caller waits for the same face, including while another chain is loading it.
    await registerFace(family, buffer);
    installFont(family, shard.characters, buffer);
    return family;
  }));
  const [baseFamilies, shardFamilies] = await Promise.all([basesReady, shardsReady]);
  // Keep the manifest order even when downloads finish in a different order.
  const families = [...baseFamilies, ...shardFamilies];

  const uncovered = Array.from(new Set(Array.from(text).filter(char => !hasGlyph(char))));
  if (uncovered.length) throw new Error('FONT_UNCOVERED');
  const family = [...families.map(name => `"${name}"`), '"Songti SC"', '"Noto Serif CJK SC"', 'serif'].join(', ');
  document.documentElement.style.setProperty('--flow-classic-family', family);
  return { version: manifest.version, family, families, characters: text };
}
