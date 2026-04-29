"use client";

const CONTENT = [
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
];

const GROUPS = ["first", "second"] as const;

const SimonRogersEffect = () => {
  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <div
        className="animate-scroll-up"
        style={{
          perspective: "900px",
          transformStyle: "preserve-3d",
          transform: "rotateX(10deg) rotateZ(-3deg)",
        }}
      >
        {GROUPS.map(group => (
          <div key={group} className="py-40">
            {CONTENT.map((line, index) => (
              <div
                key={`${group}-${index}`}
                className="mb-6 flex justify-center px-8"
                style={{
                  transformStyle: "preserve-3d",
                  minHeight: line ? "auto" : "1.5rem",
                }}
              >
                <p className="max-w-4xl text-center font-serif text-lg leading-relaxed text-black md:text-xl lg:text-2xl">
                  {line || "\u00A0"}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimonRogersEffect;
