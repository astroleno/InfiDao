export const CLOSING_PRESETS = [
  { id: 'water', quote: '上善若水。', source: '道德经', chapter: '第八章' },
  { id: 'learning', quote: '学而时习之，不亦说乎？', source: '论语', chapter: '学而' },
  { id: 'stillness', quote: '知止而后有定，定而后能静。', source: '大学', chapter: '经一章' },
] as const;

export const CLOSING_ASSET_ROOT = '/flow-assets/keepsakes/closing-v1';
export const CLOSING_ROTATION_KEY = 'infidao:closing-card:v1';

/** Random once, then continue through the three fixed cards without an immediate repeat. */
export function nextClosingPreset(previousId: string | null, random = Math.random) {
  const previous = CLOSING_PRESETS.findIndex(preset => preset.id === previousId);
  const index = previous < 0
    ? Math.min(CLOSING_PRESETS.length - 1, Math.max(0, Math.floor(random() * CLOSING_PRESETS.length)))
    : (previous + 1) % CLOSING_PRESETS.length;
  return index;
}
