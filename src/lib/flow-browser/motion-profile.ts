import { bendSettings } from './bend';
import { ribbonProjection } from './ribbon-optics';

/** Reader material and retained comparison profiles. The reader defaults to
 * liquid-live; current is the original glass; the other liquids are frozen
 * comparison fixtures. */
export type StreamMotionVariant = 'current' | 'liquid' | 'liquid-caustic' | 'liquid-contact' | 'liquid-flow' | 'liquid-live-before' | 'liquid-live';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
// The reader's water clings to the rim without pulling lettering into drips.
export const LIVE_ADHESION = .4;
const LIVE_FOCUS_BLUR = .3;
const smooth = (value: number) => value * value * (3 - 2 * value);

export function streamBendSettings(width: number, height: number, variant: StreamMotionVariant = 'current', scrollTop = 0) {
  const shape = bendSettings(width, height);
  if (variant === 'current') return shape;
  return { ...shape, adhesion: variant === 'liquid-live' ? LIVE_ADHESION : 1.2, adhesionScroll: scrollTop, liquid: true,
    caustics: variant === 'liquid' ? 0 : .24,
    contacts: variant !== 'liquid' && variant !== 'liquid-caustic',
    perlin: variant === 'liquid-flow' || variant === 'liquid-live-before' || variant === 'liquid-live',
    ...(variant === 'liquid-live' ? { ripple: 1, echoQuiet: .8 } : {}) };
}

export function streamProjection(input: Parameters<typeof ribbonProjection>[0], variant: StreamMotionVariant = 'current') {
  const projection = ribbonProjection(input);
  if (variant === 'current' || input.reducedMotion || !input.viewportHeight) return { ...projection, fire: 1 };
  const y = input.y - input.scrollTop;
  const distance = Math.min(y, input.viewportHeight - y);
  const zone = Math.min(360, input.viewportHeight * .38);
  const depth = clamp(1 - distance / zone);
  const mobile = 1 - smooth(clamp((input.viewportWidth - 600) / 300));
  // Keep the established concave shape. Only move the focal falloff closer to
  // the rim, so the unfolding strokes remain visible for longer.
  const focus = smooth(clamp((depth - .12) / .82));
  const rim = smooth(clamp((depth - .32) / .45)) * (1 - smooth(clamp((depth - .88) / .12)));
  const originalOpacity = 1 - smooth(clamp(depth / .98)) * .96;
  const heldOpacity = 1 - smooth(clamp((depth - .48) / .5)) * .98;
  return {
    ...projection,
    // Liquid glass bends content rather than fogging it; the reader keeps a trace of depth.
    blur: focus * (5.5 + mobile * 1.5) * (1 - rim * .62) * (variant === 'liquid-live' ? LIVE_FOCUS_BLUR : 1),
    opacity: originalOpacity + (heldOpacity - originalOpacity) * .5,
    fire: (1 + rim * .18) * (1 + rim * .22),
  };
}
