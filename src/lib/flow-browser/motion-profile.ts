import { bendSettings } from './bend';
import { ribbonProjection } from './ribbon-optics';

/** Reader material and retained comparison profiles. The reader defaults to liquid-live. */
export type StreamMotionVariant = 'current' | 'refine-before' | 'refine' | 'refine-strong' | 'liquid' | 'liquid-caustic' | 'liquid-contact' | 'liquid-flow' | 'liquid-settle' | 'liquid-live-before' | 'liquid-live' | 'unfold';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

export function streamBendSettings(width: number, height: number, variant: StreamMotionVariant = 'current', scrollTop = 0) {
  const shape = bendSettings(width, height);
  if (variant === 'liquid' || variant === 'liquid-caustic' || variant === 'liquid-contact' || variant === 'liquid-flow' || variant === 'liquid-settle' || variant === 'liquid-live-before' || variant === 'liquid-live') {
    return { ...shape, adhesion: 1.2, adhesionScroll: scrollTop, liquid: true,
      caustics: variant === 'liquid' ? 0 : .24, contacts: variant === 'liquid-contact' || variant === 'liquid-flow' || variant === 'liquid-settle' || variant === 'liquid-live-before' || variant === 'liquid-live',
      perlin: variant === 'liquid-flow' || variant === 'liquid-settle' || variant === 'liquid-live-before' || variant === 'liquid-live' };
  }
  if (variant === 'refine' || variant === 'refine-strong') {
    return { ...shape, adhesion: variant === 'refine' ? .8 : 1.2, adhesionScroll: scrollTop };
  }
  if (variant !== 'unfold' || !height) return shape;
  // A second direction for comparison: a wide, flat reading plane and a
  // shorter lens at either edge. The existing shader and hit inverse agree.
  const zone = Math.min(220, height * .25) / height;
  return { ...shape, zone, rounding: zone * .26, angle: 89 * Math.PI / 180,
    perspective: shape.perspective * 1.6, flare: .12 };
}

export function streamProjection(input: Parameters<typeof ribbonProjection>[0], variant: StreamMotionVariant = 'current') {
  const projection = ribbonProjection(input);
  if (variant === 'current' || input.reducedMotion || !input.viewportHeight) return { ...projection, fire: 1 };
  const y = input.y - input.scrollTop;
  const distance = Math.min(y, input.viewportHeight - y);
  const refining = variant !== 'unfold';
  const adhering = variant === 'refine' || variant === 'refine-strong' || variant === 'liquid' || variant === 'liquid-caustic' || variant === 'liquid-contact' || variant === 'liquid-flow' || variant === 'liquid-settle' || variant === 'liquid-live-before' || variant === 'liquid-live';
  const zone = refining
    ? Math.min(360, input.viewportHeight * .38)
    : Math.min(220, input.viewportHeight * .25);
  const depth = clamp(1 - distance / zone);
  const mobile = 1 - smooth(clamp((input.viewportWidth - 600) / 300));
  // Keep the established concave shape in refine. Only move the focal falloff
  // closer to the rim, so the unfolding strokes remain visible for longer.
  const focus = smooth(clamp((depth - .12) / .82));
  const rim = smooth(clamp((depth - .32) / .45)) * (1 - smooth(clamp((depth - .88) / .12)));
  const originalOpacity = 1 - smooth(clamp(depth / .98)) * .96;
  const heldOpacity = 1 - smooth(clamp((depth - .48) / .5)) * .98;
  return {
    ...projection,
    blur: focus * (refining ? 5.5 + mobile * 1.5 : 4) * (adhering ? 1 - rim * .62 : 1),
    opacity: adhering ? originalOpacity + (heldOpacity - originalOpacity) * .5 : originalOpacity,
    fire: (1 + rim * (refining ? .18 : .35)) * (adhering ? 1 + rim * .22 : 1),
  };
}
