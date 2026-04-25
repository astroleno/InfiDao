"use client";
import { useEffect, useRef } from "react";

export default function SimonRogersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  const textLines = [
    "The Egg",
    "By: Andy Weir",
    "",
    "You were on your way home when you died.",
    "",
    "It was a car accident. Nothing particularly remarkable, but fatal nonetheless.",
    "You left behind a wife and two children. It was a painless death.",
    "The EMTs tried their best to save you, but to no avail.",
    "Your body was so utterly shattered you were better off, trust me.",
    "",
    "And that's when you met me.",
    "",
    '"What… what happened?" You asked. "Where am I?"',
    "",
    '"You died," I said, matter-of-factly. No point in mincing words.',
    "",
    '"There was a… a truck and it was skidding…"',
    "",
    '"Yup," I said.',
    "",
    '"I… I died?"',
    "",
    '"Yup. But don\'t feel bad about it. Everyone dies," I said.',
    "",
    "You looked around. There was nothingness. Just you and me.",
    '"What is this place?" You asked. "Is this the afterlife?"',
    "",
    '"More or less," I said.',
    "",
    '"Are you god?" You asked.',
    "",
    '"Yup," I replied. "I\'m God."',
    "",
    '"My kids… my wife," you said.',
    "",
    '"What about them?"',
    "",
    '"Will they be all right?"',
    "",
    '"That\'s what I like to see," I said.',
    '"You just died and your main concern is for your family.',
    'That\'s good stuff right there."',
    "",
    "You looked at me with fascination. To you, I didn't look like God.",
    "I just looked like some man. Or possibly a woman.",
    "Some vague authority figure, maybe.",
    "More of a grammar school teacher than the almighty.",
    "",
    '"Don\'t worry," I said. "They\'ll be fine.',
    "Your kids will remember you as perfect in every way.",
    "They didn't have time to grow contempt for you.",
    "Your wife will cry on the outside, but will be secretly relieved.",
    "To be fair, your marriage was falling apart.",
    'If it\'s any consolation, she\'ll feel very guilty for feeling relieved."',
    "",
    '"Oh," you said. "So what happens now?',
    'Do I go to heaven or hell or something?"',
    "",
    '"Neither," I said. "You\'ll be reincarnated."',
    "",
    '"Ah," you said. "So the Hindus were right,"',
    "",
    '"All religions are right in their own way," I said. "Walk with me."',
    "",
    "You followed along as we strode through the void.",
    '"Where are we going?"',
    "",
    '"Nowhere in particular," I said.',
    '"It\'s just nice to walk while we talk."',
    "",
    '"So what\'s the point, then?" You asked.',
    '"When I get reborn, I\'ll just be a blank slate, right? A baby.',
    'So all my experiences and everything I did in this life won\'t matter."',
    "",
    '"Not so!" I said.',
    '"You have within you all the knowledge and experiences',
    'of all your past lives. You just don\'t remember them right now."',
    "",
    'I stopped walking and took you by the shoulders.',
    '"Your soul is more magnificent, beautiful, and gigantic',
    "than you can possibly imagine.",
    "A human mind can only contain a tiny fraction of what you are.",
    'It\'s like sticking your finger in a glass of water',
    "to see if it's hot or cold.",
    "You put a tiny part of yourself into the vessel,",
    "and when you bring it back out,",
    "you've gained all the experiences it had.",
    "",
    '"You\'ve been in a human for the last 48 years,',
    "so you haven't stretched out yet",
    "and felt the rest of your immense consciousness.",
    "If we hung out here for long enough,",
    "you'd start remembering everything.",
    'But there\'s no point to doing that between each life."',
    "",
    '"How many times have I been reincarnated, then?"',
    "",
    '"Oh lots. Lots and lots. An in to lots of different lives." I said.',
    '"This time around, you\'ll be a Chinese peasant girl in 540 AD."',
    "",
    '"Wait, what?" You stammered. "You\'re sending me back in time?"',
    "",
    '"Well, I guess technically. Time, as you know it,',
    'only exists in your universe.',
    'Things are different where I come from."',
    "",
    '"Where you come from?" You said.',
    "",
    '"Oh sure," I explained "I come from somewhere.',
    'Somewhere else. And there are others like me.',
    "I know you'll want to know what it's like there,",
    'but honestly you wouldn\'t understand."',
    "",
    '"Oh," you said, a little let down.',
    '"But wait. If I get reincarnated to other places in time,',
    'I could have interacted with myself at some point."',
    "",
    '"Sure. Happens all the time.',
    "And with both lives only aware of their own lifespan",
    'you don\'t even know it\'s happening."',
    "",
    '"So what\'s the point of it all?"',
    "",
    '"Seriously?" I asked. "Seriously?',
    "You're asking me for the meaning of life?",
    'Isn\'t that a little stereotypical?"',
    "",
    '"Well it\'s a reasonable question," you persisted.',
    "",
    'I looked you in the eye.',
    '"The meaning of life, the reason I made this whole universe,',
    'is for you to mature."',
    "",
    '"You mean mankind? You want us to mature?"',
    "",
    '"No, just you. I made this whole universe for you.',
    "With each new life you grow and mature",
    'and become a larger and greater intellect."',
    "",
    '"Just me? What about everyone else?"',
    "",
    '"There is no one else," I said.',
    '"In this universe, there\'s just you and me."',
    "",
    'You stared blankly at me. "But all the people on earth…"',
    "",
    '"All you. Different incarnations of you."',
    "",
    '"Wait. I\'m everyone!?"',
    "",
    '"Now you\'re getting it," I said, with a congratulatory slap on the back.',
    "",
    '"I\'m every human being who ever lived?"',
    "",
    '"Or who will ever live, yes."',
    "",
    '"I\'m Abraham Lincoln?"',
    "",
    '"And you\'re John Wilkes Booth, too," I added.',
    "",
    '"I\'m Hitler?" You said, appalled.',
    "",
    '"And you\'re the millions he killed."',
    "",
    '"I\'m Jesus?"',
    "",
    '"And you\'re everyone who followed him."',
    "",
    "You fell silent.",
    "",
    '"Every time you victimized someone," I said,',
    '"you were victimizing yourself.',
    "Every act of kindness you've done, you've done to yourself.",
    "Every happy and sad moment ever experienced by any human",
    'was, or will be, experienced by you."',
    "",
    "You thought for a long time.",
    "",
    '"Why?" You asked me. "Why do all this?"',
    "",
    "Because someday, you will become like me.",
    "Because that is what you are.",
    "You are one of my kind. You are my child.",
    "",
    "Whoa, you said, incredulous. You mean I am a god?",
    "",
    "No. Not yet. You are a fetus. You are still growing.",
    "Once you have lived every human life throughout all time,",
    "you will have grown enough to be born.",
    "",
    "So the whole universe, you said, it is just…",
    "",
    "An egg. I answered. Now it is time for you to move on to your next life.",
    "",
    "And I sent you on your way.",
  ];

  useEffect(() => {
    let rafId: number | null = null;

    const updateRotations = () => {
      const nodeList = containerRef.current?.querySelectorAll(".text-line");
      if (!nodeList || nodeList.length === 0) {
        rafId = requestAnimationFrame(updateRotations);
        return;
      }

      const viewportHeight = window.innerHeight;
      const centerY = viewportHeight / 2;

      nodeList.forEach((node) => {
        (node as HTMLElement).style.transform = "none";
      });

      nodeList.forEach((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;

        const distanceFromCenter = (elementCenter - centerY) / centerY;
        const clamped = Math.max(-1.1, Math.min(1.1, distanceFromCenter));

        const maxRotateX = 58;
        const maxRotateY = 105;
        const maxRotateZ = 18;
        const maxTranslateZ = 460;
        const translateYOffset = 125;

        const rotateX = clamped * maxRotateX - 10;
        const rotateY = clamped * -maxRotateY;
        const rotateZ = clamped * maxRotateZ;
        const translateZ = (1 - Math.abs(clamped)) * maxTranslateZ - maxTranslateZ * 0.45;
        const translateY = clamped * translateYOffset;

        const scale = 0.48 + (1 - Math.abs(clamped)) * 0.58;
        const opacity = 0.2 + (1 - Math.min(1, Math.abs(clamped))) * 0.8;

        element.style.transform = `translateY(${translateY}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
        element.style.opacity = opacity.toFixed(3);
      });

      rafId = requestAnimationFrame(updateRotations);
    };

    rafId = requestAnimationFrame(updateRotations);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
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
        {/* 第一组 */}
        <div className="py-40">
          {textLines.map((line, index) => (
            <div
              key={`first-${index}`}
              className="text-line mb-4 flex justify-center px-8"
              style={{
                transformStyle: "preserve-3d",
                minHeight: line ? "2.8rem" : "1.25rem",
              }}
            >
              <p className="max-w-3xl text-center font-serif text-[1.35rem] italic leading-relaxed text-[#5968ff] md:text-[1.55rem] lg:text-[1.75rem]">
                {line || '\u00A0'}
              </p>
            </div>
          ))}
        </div>
        
        {/* 第二组（无缝循环） */}
        <div className="py-40">
          {textLines.map((line, index) => (
            <div
              key={`second-${index}`}
              className="text-line mb-4 flex justify-center px-8"
              style={{
                transformStyle: "preserve-3d",
                minHeight: line ? "2.8rem" : "1.25rem",
              }}
            >
              <p className="max-w-3xl text-center font-serif text-[1.35rem] italic leading-relaxed text-[#5968ff] md:text-[1.55rem] lg:text-[1.75rem]">
                {line || '\u00A0'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
