jest.mock('../../miniprogram/flow/glyph-outline', () => ({ installFont: jest.fn(), hasGlyph: () => true }));
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('font asset readiness', () => {
  const previousFetch = Object.getOwnPropertyDescriptor(global, 'fetch');
  const previousFontFace = Object.getOwnPropertyDescriptor(global, 'FontFace');
  const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const manifest = { version: 'v1', shards: [{ id: 'one', file: 'one.ttf', characters: '甲', bytes: 2, sha256: '01' }] };
  let fetchMock: jest.Mock;
  let faceMock: jest.Mock;
  let prepare: typeof import('@/lib/flow-browser/fonts').prepareFlowFonts;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn(async (url: string) => url.endsWith('manifest.json')
      ? { ok: true, json: async () => manifest }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
    faceMock = jest.fn().mockImplementation(() => ({ load: async () => ({}) }));
    Object.defineProperty(global, 'fetch', { configurable: true, value: fetchMock });
    Object.defineProperty(global, 'FontFace', { configurable: true, value: faceMock });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: jest.fn() } });
    const original = require('@/lib/flow-browser/fonts').prepareFlowFonts as typeof prepare;
    prepare = (frames, baseUrl = '/test-fonts') => original(frames, baseUrl);
  });

  afterEach(() => {
    for (const [object, key, descriptor] of [
      [global, 'fetch', previousFetch], [global, 'FontFace', previousFontFace], [document, 'fonts', previousFonts],
    ] as const) {
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else Reflect.deleteProperty(object, key);
    }
  });

  test('concurrent callers both wait for the shard face to finish loading', async () => {
    let release!: () => void;
    let started!: () => void;
    const loading = new Promise<void>(resolve => { release = resolve; });
    const shardStarted = new Promise<void>(resolve => { started = resolve; });
    faceMock.mockImplementation((family: string) => ({ load: () => {
      if (family.startsWith('InfiDao-one-')) { started(); return loading; }
      return Promise.resolve();
    } }));
    const first = prepare([{ quote: '甲' }]);
    await shardStarted;
    let secondReady = false;
    const second = prepare([{ quote: '甲' }]).then(value => { secondReady = true; return value; });
    await Promise.resolve();
    await Promise.resolve();
    expect(secondReady).toBe(false);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.family).toBe(b.family);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('one.ttf'))).toHaveLength(1);
    expect(faceMock.mock.calls.filter(([family]) => family.startsWith('InfiDao-one-'))).toHaveLength(1);
  });

  test('rejects truncated shards and retries rather than caching the failure', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => manifest }))
      .mockImplementationOnce(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    await expect(prepare([{ quote: '甲' }])).rejects.toThrow('FONT_INCOMPLETE');
    await expect(prepare([{ quote: '甲' }])).resolves.toMatchObject({ version: 'v1' });
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('one.ttf'))).toHaveLength(2);
  });

  test('keeps manifests separate for different asset bases', async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => ({ version: url, shards: [] }) }));
    expect((await prepare([], '/version-a')).version).toBe('/version-a/manifest.json');
    expect((await prepare([], '/version-b')).version).toBe('/version-b/manifest.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('downloads different shards concurrently with a shared cap and preserves family order', async () => {
    const shards = Array.from('甲乙丙丁戊', (characters, index) => ({ id: String(index), file: `${index}.ttf`, characters, bytes: 2, sha256: '01' }));
    const releases: Array<() => void> = [];
    let active = 0, peak = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => ({ version: 'parallel', shards }) };
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => { releases.push(() => { active--; resolve(); }); });
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    });
    const first = prepare([{ quote: '甲乙丙丁戊' }]);
    const second = prepare([{ quote: '甲乙丙丁戊' }]);
    // Drain deterministic microtasks without timers or network timing assumptions.
    for (let i = 0; i < 30 && releases.length < 3; i++) await Promise.resolve();
    expect(releases).toHaveLength(3);
    expect(active).toBe(3);
    releases[2]!(); releases[1]!(); releases[0]!();
    for (let i = 0; i < 30 && releases.length < 5; i++) await Promise.resolve();
    expect(releases).toHaveLength(5);
    releases[4]!(); releases[3]!();
    const [a, b] = await Promise.all([first, second]);
    expect(peak).toBe(3);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('.ttf'))).toHaveLength(5);
    expect(a.families.slice(2)).toEqual(shards.map(shard => `InfiDao-${shard.id}-01`));
    expect(a.family).toBe(b.family);
  });

  test('a failed CDN shard loads the pinned same-origin copy with the same integrity metadata', async () => {
    const original = process.env.NEXT_PUBLIC_FLOW_FONT_CDN_BASE;
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'public/flow-fonts/manifest.json'), 'utf8'));
    const character = Array.from(manifest.shards[0].characters as string).find(value => /\p{L}/u.test(value)) || '甲';
    process.env.NEXT_PUBLIC_FLOW_FONT_CDN_BASE = 'https://cdn.example.invalid/flow/v-' + manifest.version;
    jest.resetModules();
    const fallback = require('@/lib/flow-browser/fonts').prepareFlowFonts as typeof prepare;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest };
      if (url.startsWith('https://cdn.example.invalid/')) return { ok: false };
      const bytes = readFileSync(path.join(process.cwd(), 'public', url));
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    });
    try {
      expect((await fallback([{ quote: character }])).version).toBe(manifest.version);
      expect(fetchMock.mock.calls.some(([url]) => url.startsWith('https://cdn.example.invalid/') && url.endsWith('.woff'))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/flow-assets/') && url.endsWith('.woff'))).toBe(true);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_FLOW_FONT_CDN_BASE;
      else process.env.NEXT_PUBLIC_FLOW_FONT_CDN_BASE = original;
    }
  });
});
