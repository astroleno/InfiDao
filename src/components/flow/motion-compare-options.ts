/** Recording stage controls for the comparison page: a pinned surface seed,
 * autoplay, speed and layout make captures repeatable. Ordinary visits keep
 * the defaults. */
export type CompareOptions = { seed: number | undefined; play: boolean; speed: 12 | 36 | 72; single: boolean };

const speeds = [12, 36, 72] as const;

export function readCompareOptions(search: string): CompareOptions {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText === null ? Number.NaN : Number(seedText);
  const speed = speeds.find(value => value === Number(params.get('speed'))) ?? 36;
  return {
    // The surface noise has a 289-cell period.
    seed: Number.isFinite(seed) && seed >= 0 && seed < 289 ? seed : undefined,
    play: params.get('play') === '1',
    speed,
    single: params.get('view') !== 'compare',
  };
}
