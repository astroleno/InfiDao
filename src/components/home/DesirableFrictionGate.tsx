import { useEffect, type KeyboardEvent } from "react";
import {
  FRICTION_DIRECTIONS,
  type FrictionDirection,
} from "./kineticTextCopy";

interface QueryGateProps {
  mode: "query";
  query: string;
  directions?: FrictionDirection[];
  onChooseDirection: (direction: FrictionDirection) => void;
  onContinue: () => void;
  onSkip: () => void;
}

interface ReadingGateProps {
  mode: "reading";
  targetLabel: string;
  passageText: string;
  resonanceLabel: string;
  dwellMs?: number;
  reducedMotion: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

type DesirableFrictionGateProps = QueryGateProps | ReadingGateProps;

export function DesirableFrictionGate(props: DesirableFrictionGateProps) {
  useEffect(() => {
    if (props.mode !== "reading" || props.reducedMotion) {
      return undefined;
    }

    const dwell = Math.min(1200, Math.max(600, props.dwellMs ?? 800));
    const timeout = window.setTimeout(() => {
      props.onContinue();
    }, dwell);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [props]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    props.onSkip();
  };

  if (props.mode === "query") {
    const directions = props.directions ?? FRICTION_DIRECTIONS;

    return (
      <div
        role="region"
        aria-label="短问入经方向"
        onKeyDown={handleKeyDown}
        className="pointer-events-none fixed inset-x-4 top-[18vh] z-30 mx-auto max-w-3xl md:top-[24vh]"
      >
        <div className="pointer-events-auto border-y border-zen/45 bg-ink/92 px-5 py-6 text-paper shadow-[0_24px_80px_-46px_rgba(199,179,139,0.55)] backdrop-blur md:px-8 md:py-8">
          <p className="text-xs tracking-[0.28em] text-zen/85">先定一向</p>
          <h2 className="mt-3 text-2xl leading-snug font-classic md:text-3xl">
            “{props.query}” 很短，可以先选一个入经方向。
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
            方向只记录为本次阅读语气，不会改写你的原问。
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {directions.map(direction => (
              <button
                key={direction.id}
                type="button"
                onClick={() => props.onChooseDirection(direction)}
                className="min-h-11 border-y border-stone-700 px-4 py-3 text-left transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                <span className="block text-base tracking-[0.18em] text-zen font-classic">
                  {direction.label}
                </span>
                <span className="mt-2 block text-sm leading-6 text-stone-300">
                  {direction.description}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={props.onContinue}
            className="mt-5 inline-flex min-h-11 items-center justify-center border-b border-stone-700 px-2 py-2 text-sm tracking-[0.16em] text-stone-300 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
          >
            不选方向，直接入经
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="入经前停顿"
      onKeyDown={handleKeyDown}
      className="pointer-events-none fixed inset-x-4 top-[16vh] z-30 mx-auto max-w-2xl md:top-[22vh]"
    >
      <div className="pointer-events-auto border-y border-zen/45 bg-ink/92 px-5 py-6 text-center text-paper shadow-[0_24px_80px_-46px_rgba(199,179,139,0.55)] backdrop-blur md:px-8 md:py-8">
        <p className="text-xs tracking-[0.28em] text-zen/85">{props.resonanceLabel}</p>
        <h2 className="mt-3 text-2xl leading-snug font-classic md:text-3xl">
          {props.targetLabel}
        </h2>
        <blockquote className="mx-auto mt-4 max-w-xl text-xl leading-[1.75] text-paper font-classic">
          {props.passageText}
        </blockquote>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-stone-300">
          先停一息，再让注语展开。你也可以立即继续。
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={props.onSkip}
            className="inline-flex min-h-11 items-center justify-center border border-stone-700 px-5 py-2 text-sm tracking-[0.16em] text-stone-300 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
          >
            略过停顿
          </button>
          <button
            type="button"
            onClick={props.onContinue}
            className="inline-flex min-h-11 items-center justify-center border border-zen bg-zen px-5 py-2 text-sm tracking-[0.16em] text-ink transition hover:border-paper hover:bg-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
          >
            继续入经
          </button>
        </div>
      </div>
    </div>
  );
}
