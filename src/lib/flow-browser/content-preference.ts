import type { ContentPackId, ContentScope } from '@/lib/content/contracts';
const key = 'infidao:content-packs:v1';
export function readContentPreference(): ContentPackId[] {
  try { return globalThis.localStorage?.getItem(key) === 'poetry' ? ['core','poetry'] : ['core']; }
  catch { return ['core']; }
}
let transient: ContentPackId[] | undefined;
export function currentContentPacks() { return transient || readContentPreference(); }
export function writeContentPreference(poetry: boolean): boolean {
  transient = poetry ? ['core','poetry'] : ['core'];
  try { if (poetry) globalThis.localStorage.setItem(key,'poetry'); else globalThis.localStorage.removeItem(key); transient = undefined; return true; }
  catch { return false; }
}
export const contentPacksKey = (ids?: ContentPackId[]) => (ids || ['core']).slice().sort().join(',');
export function matchesContentPreference(scope?: ContentScope) {
  const requested = [...(scope?.packIds || ['core']), ...(scope?.unavailable || [])];
  return [...new Set(requested)].sort().join(',') === contentPacksKey(currentContentPacks());
}
