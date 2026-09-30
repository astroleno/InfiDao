/** New model work follows reading movement, except the first animated frame. */
export function shouldPrefetchFlow(input: {
  ordinal: number; lastOrdinal: number; frameCount: number; moved: boolean; paused: boolean; reducedMotion: boolean;
}) {
  if (input.frameCount < 1 || input.ordinal < input.lastOrdinal - 1) return false;
  return input.moved || (input.frameCount === 1 && !input.paused && !input.reducedMotion);
}
