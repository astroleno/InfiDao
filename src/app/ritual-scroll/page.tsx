"use client";

import { useEffect, useRef, useState } from "react";

const TEXT_LINES = [
  "六经注我",
  "",
  "大学：大学之道，在明明德，在亲民，在止于至善。",
  "此刻一念：我如何安住眼前之事？",
  "回响：知止而后有定，定而后能静。",
  "",
  "论语：君子不重则不威，学则不固。",
  "此刻一念：我如何不被纷扰牵走？",
  "回响：主忠信，过则勿惮改。",
  "",
  "孟子：恻隐之心，仁之端也。",
  "此刻一念：我如何回应他人的困境？",
  "回响：从一念不忍处，重新看见行动。",
  "",
  "中庸：喜怒哀乐之未发，谓之中。",
  "此刻一念：情绪未出口前，我还能怎样选择？",
  "回响：发而皆中节，谓之和。",
  "",
  "诗经：高山仰止，景行行止。",
  "此刻一念：我愿意把目光放在哪里？",
  "回响：向高处看，也从脚下行。",
  "",
  "易经：天行健，君子以自强不息。",
  "此刻一念：今天还能推进哪一小步？",
  "回响：不必一次抵达，先让一念成行。",
];

const LINE_GROUPS = ["first", "second"] as const;

function updateLineStyle(element: HTMLElement, viewportHeight: number) {
  const centerY = viewportHeight / 2;
  const rect = element.getBoundingClientRect();

  if (rect.bottom < -viewportHeight * 0.35 || rect.top > viewportHeight * 1.35) {
    return;
  }

  const elementCenter = rect.top + rect.height / 2;
  const distanceFromCenter = (elementCenter - centerY) / centerY;
  const clamped = Math.max(-1.1, Math.min(1.1, distanceFromCenter));

  const rotateX = clamped * 52 - 8;
  const rotateY = clamped * -88;
  const rotateZ = clamped * 14;
  const translateZ = (1 - Math.abs(clamped)) * 380 - 150;
  const translateY = clamped * 105;
  const scale = 0.52 + (1 - Math.abs(clamped)) * 0.5;
  const opacity = 0.24 + (1 - Math.min(1, Math.abs(clamped))) * 0.76;

  element.style.transform = `translateY(${translateY}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
  element.style.opacity = opacity.toFixed(3);
}

export default function RitualScrollPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);
  const shouldRenderStatic = prefersReducedMotion !== false;

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (!mediaQuery) {
      setPrefersReducedMotion(false);
      return undefined;
    }

    const syncMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(".text-line") ?? []);

    if (elements.length === 0 || typeof window.IntersectionObserver !== "function" || shouldRenderStatic) {
      return undefined;
    }

    const nearViewport = new Set<HTMLElement>();
    let frameId: number | null = null;

    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);
    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame
        : window.clearTimeout;

    const updateVisibleLines = () => {
      frameId = null;
      const viewportHeight = window.innerHeight || 1;

      nearViewport.forEach(element => updateLineStyle(element, viewportHeight));

      if (!isPaused && nearViewport.size > 0) {
        scheduleUpdate();
      }
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = scheduleFrame(updateVisibleLines);
    };

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;

          if (entry.isIntersecting) {
            nearViewport.add(element);
          } else {
            nearViewport.delete(element);
          }
        });

        scheduleUpdate();
      },
      {
        root: null,
        rootMargin: "35% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    elements.forEach((element) => {
      element.style.willChange = "transform, opacity";
      observer.observe(element);
    });

    const handleResize = () => scheduleUpdate();

    window.addEventListener("resize", handleResize);
    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);

      if (frameId !== null) {
        cancelFrame(frameId);
      }

      elements.forEach((element) => {
        element.style.willChange = "";
      });
    };
  }, [isPaused, shouldRenderStatic]);

  return (
    <div className={shouldRenderStatic ? "min-h-screen min-h-[100dvh] overflow-y-auto bg-background py-12" : "fixed inset-0 overflow-hidden bg-background"}>
      {!shouldRenderStatic && (
        <button
          type="button"
          aria-pressed={isPaused}
          onClick={() => setIsPaused(current => !current)}
          className="fixed right-4 top-4 z-10 border border-stone-700 bg-ink/80 px-3 py-2 text-xs tracking-[0.18em] text-zen transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
        >
          {isPaused ? "继续滚动" : "暂停滚动"}
        </button>
      )}
      <div
        className={shouldRenderStatic ? "" : "motion-safe:animate-scroll-up motion-reduce:animate-none"}
        ref={containerRef}
        style={shouldRenderStatic
          ? undefined
          : {
              animationPlayState: isPaused ? "paused" : "running",
              perspective: "900px",
              transformStyle: "preserve-3d",
              transform: "rotateX(9deg) rotateZ(-4deg)",
            }}
      >
        {(shouldRenderStatic ? ["static"] : LINE_GROUPS).map(group => (
          <div key={group} className={shouldRenderStatic ? "py-4" : "py-40"}>
            {TEXT_LINES.map((line, index) => (
              <div
                key={`${group}-${index}`}
                className="text-line mb-4 flex justify-center px-8"
                style={{
                  transformStyle: shouldRenderStatic ? undefined : "preserve-3d",
                  minHeight: line ? "2.8rem" : "1.25rem",
                }}
              >
                <p className="max-w-3xl text-center font-classic text-[1.35rem] italic leading-relaxed text-zen md:text-[1.55rem] lg:text-[1.75rem]">
                  {line || "\u00A0"}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
