type FontShard = { id: string; file: string; characters: string; bytes: number; sha256: string };
type FontManifest = { version: string; shards: FontShard[]; unsupported?: string };
type FontReady = { version: string; family: string; families: string[]; characters: string };
import { FLOW_RELEASE } from './release.generated';
import { FLOW_FONT_BASE, FLOW_FONT_CDN_BASE, FLOW_FONT_LOCAL_BASE } from './font-assets';

const { installFont, hasGlyph } = require('../../../miniprogram/flow/glyph-outline') as {
  installFont: (id: string, characters: string, data: ArrayBuffer) => void;
  hasGlyph: (char: string) => boolean;
};
const { FAMILY, SUPPLEMENT } = require('../../../miniprogram/flow/typography') as {
  FAMILY: string;
  SUPPLEMENT: string;
};
const serifData = require('../../../miniprogram/assets/fonts/serif-data') as string;
const supplementData = require('../../../miniprogram/assets/fonts/supplement-data') as string;

const manifests = new Map<string, Promise<FontManifest>>();
const loadedFaces = new Map<string, Promise<void>>();
const loadedShards = new Map<string, Promise<ArrayBuffer>>();
const localBase = FLOW_FONT_LOCAL_BASE;
const cdnBase = FLOW_FONT_CDN_BASE;
const preferredBase = FLOW_FONT_BASE;
let activeDownloads = 0;
const downloadQueue: Array<() => void> = [];

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

function base64Buffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function loadManifest(baseUrl: string): Promise<FontManifest> {
  if (!manifests.has(baseUrl)) {
    const pending = fetch(`${baseUrl}/manifest.json`, { cache: 'force-cache' })
      .then(async response => {
        if (!response.ok) throw new Error('FONT_MANIFEST_UNAVAILABLE');
        const manifest = await response.json() as FontManifest;
        if ((baseUrl === localBase || baseUrl === cdnBase) && manifest.version !== FLOW_RELEASE.fontVersion) throw new Error('FONT_VERSION_CHANGED');
        return manifest;
      }).catch(error => {
        manifests.delete(baseUrl);
        if (baseUrl === cdnBase && cdnBase !== localBase) return loadManifest(localBase);
        throw error;
      });
    manifests.set(baseUrl, pending);
  }
  return manifests.get(baseUrl)!;
}

async function registerFace(family: string, data: ArrayBuffer | string | (() => ArrayBuffer)): Promise<void> {
  const key = family;
  if (loadedFaces.has(key)) return loadedFaces.get(key)!;
  const pending = (async () => {
    const face = new FontFace(family, typeof data === 'function' ? data() : data, { style: 'normal', weight: '400' });
    await face.load();
    document.fonts.add(face);
  })();
  loadedFaces.set(key, pending);
  pending.catch(() => loadedFaces.delete(key));
  return pending;
}

export async function prepareFlowFonts(frames: Array<{ quote: string; fullText?: string }>, baseUrl = preferredBase): Promise<FontReady> {
  baseUrl = baseUrl.replace(/\/$/, '');
  const text = Array.from(new Set(frames.flatMap(frame => Array.from(`${frame.quote}${frame.fullText || frame.quote}`)))).join('');
  const manifest = await loadManifest(baseUrl);
  const supported = new Set(manifest.shards.flatMap(shard => Array.from(shard.characters)));
  const missing = Array.from(new Set(Array.from(text).filter(char => !supported.has(char) && !hasGlyph(char))));
  if (missing.length) throw new Error('FONT_UNCOVERED');

  const needed = manifest.shards.filter(shard => Array.from(shard.characters).some(char => text.includes(char)));
  const shardsReady = Promise.all(needed.map(async shard => {
    const family = `InfiDao-${shard.id}-${shard.sha256}`;
    const key = `${baseUrl}/${shard.file}:${shard.sha256}:${shard.bytes}`;
    if (!loadedShards.has(key)) {
      const pending = download(async () => {
        const locations = baseUrl === cdnBase && cdnBase !== localBase ? [baseUrl, localBase] : [baseUrl];
        let failure: unknown;
        for (const location of locations) try {
          const response = await fetch(`${location}/${shard.file}`, { cache: 'force-cache' });
          if (!response.ok) throw new Error('FONT_UNAVAILABLE');
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength !== shard.bytes) throw new Error('FONT_INCOMPLETE');
          if (globalThis.crypto?.subtle) {
            const digest = await crypto.subtle.digest('SHA-256', buffer);
            if (hex(digest) !== shard.sha256) throw new Error('FONT_INTEGRITY');
          }
          return buffer;
        } catch (error) { failure = error; }
        throw failure;
      }).catch(error => { loadedShards.delete(key); throw error; });
      loadedShards.set(key, pending);
    }
    const buffer = await loadedShards.get(key)!;
    // Every caller waits for the same face, including while another chain is loading it.
    await registerFace(family, buffer);
    installFont(family, shard.characters, buffer);
    return family;
  }));
  const [shardFamilies] = await Promise.all([
    shardsReady,
    registerFace(FAMILY, () => base64Buffer(serifData)),
    registerFace(SUPPLEMENT, () => base64Buffer(supplementData)),
  ]);
  // Keep the manifest order even when downloads finish in a different order.
  const families = [FAMILY, SUPPLEMENT, ...shardFamilies];

  const uncovered = Array.from(new Set(Array.from(text).filter(char => !hasGlyph(char))));
  if (uncovered.length) throw new Error('FONT_UNCOVERED');
  const family = [...families.map(name => `"${name}"`), '"Songti SC"', '"Noto Serif CJK SC"', 'serif'].join(', ');
  document.documentElement.style.setProperty('--flow-classic-family', family);
  return { version: manifest.version, family, families, characters: text };
}
