import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';

describe('browser classical font preparation', () => {
  test('rejects unsupported glyphs instead of silently accepting a fallback face', async () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/flow-fonts/manifest.json'), 'utf8'));
    const previousFetch = Object.getOwnPropertyDescriptor(global, 'fetch');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => manifest } as Response);
    Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: fetchMock });
    try {
      await expect(prepareFlowFonts([{ quote: '\uE000', fullText: '\uE000' }], '/test-fonts')).rejects.toThrow('FONT_UNCOVERED');
    } finally {
      if (previousFetch) Object.defineProperty(global, 'fetch', previousFetch);
      else delete (global as typeof globalThis & { fetch?: typeof fetch }).fetch;
    }
  });
});
