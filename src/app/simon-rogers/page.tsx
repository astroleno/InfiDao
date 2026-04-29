"use client";

import { useEffect, useRef } from "react";

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

export default function SimonRogersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(".text-line") ?? []);

    if (elements.length === 0 || typeof window.IntersectionObserver !== "function") {
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
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div
        className="animate-scroll-up"
        ref={containerRef}
        style={{
          perspective: "900px",
          transformStyle: "preserve-3d",
          transform: "rotateX(9deg) rotateZ(-4deg)",
        }}
      >
        {LINE_GROUPS.map(group => (
          <div key={group} className="py-40">
            {TEXT_LINES.map((line, index) => (
              <div
                key={`${group}-${index}`}
                className="text-line mb-4 flex justify-center px-8"
                style={{
                  transformStyle: "preserve-3d",
                  minHeight: line ? "2.8rem" : "1.25rem",
                }}
              >
                <p className="max-w-3xl text-center font-serif text-[1.35rem] italic leading-relaxed text-[#5968ff] md:text-[1.55rem] lg:text-[1.75rem]">
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
