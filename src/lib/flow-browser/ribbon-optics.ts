const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** The shared Bend owns perspective; a nearer rim falls out of focus. */
export function ribbonProjection(input: {
  x: number;
  y: number;
  wordWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollTop: number;
  reducedMotion: boolean;
}) {
  const axis = input.viewportWidth / 2;
  // Moving the origin, rather than each word, keeps a whole line on one plane.
  const origin = `${(axis - input.x + input.wordWidth / 2).toFixed(2)}px 50%`;
  if (input.reducedMotion || !input.viewportHeight) {
    return { origin, transform: 'none', blur: 0, scale: 1, opacity: 1 };
  }
  const y = input.y - input.scrollTop;
  // Keep the established reading focus while geometry curves closer to center.
  // A gently bent neighboring line must not become blurry just for bending.
  const zone = Math.min(360, input.viewportHeight * .38);
  const depth = clamp(1 - Math.min(y, input.viewportHeight - y) / zone);
  const mobile = 1 - smooth(clamp((input.viewportWidth - 600) / 300));
  return {
    origin,
    // A second edge shrink would oppose the concave surface's nearer rim.
    // Keep a valid transform to compose with the existing entrance translation.
    transform: 'scale(1)',
    // Defocus starts on the adjacent lines, not just at the last few pixels.
    blur: smooth(clamp(depth / .72)) * (7 + mobile * 2),
    scale: 1,
    opacity: 1 - smooth(clamp(depth / .9)) * .78,
  };
}
