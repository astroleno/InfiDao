import { createHash } from 'node:crypto';
import type { ContentPackId, ContentScope } from './contracts';
import { activePoetryManifest } from './store';

export async function resolveContentScope(ids: ContentPackId[] = ['core']): Promise<ContentScope> {
  const versions: Record<string,string> = { core: 'guji-core-v1' }, packIds: ContentPackId[] = ['core'], unavailable: string[] = [];
  if (ids.includes('poetry')) {
    try { versions.poetry = (await activePoetryManifest()).version; packIds.push('poetry'); }
    catch (error) {
      unavailable.push('poetry');
      if (process.env.NODE_ENV === 'development') console.warn('[content-pack] Poetry index unavailable:', error instanceof Error ? error.message : 'incompatible index');
    }
  }
  return { packIds, versions, unavailable, fingerprint: createHash('sha256').update(JSON.stringify(versions)).digest('hex').slice(0,24) };
}
