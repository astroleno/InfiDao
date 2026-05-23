import type { CSSProperties } from "react";
import { KINETIC_TEXT_LINES, type KineticTextLine } from "./kineticTextCopy";

export type KineticTextPhase =
  | "idle"
  | "typing"
  | "friction"
  | "submitting"
  | "results"
  | "annotation"
  | "explore"
  | "error"
  | "back";

interface KineticTextFieldProps {
  lines?: KineticTextLine[];
  paused: boolean;
  reducedMotion: boolean;
  phase: KineticTextPhase;
  tone?: "warm" | "quiet";
}

const FRAGMENT_LAYOUT = [
  { x: "9%", y: "8%", z: "-320px", scale: "0.62", rotate: "-14deg", duration: "58s", delay: "-7s", band: "far" },
  { x: "62%", y: "5%", z: "-170px", scale: "0.78", rotate: "8deg", duration: "46s", delay: "-19s", band: "mid" },
  { x: "27%", y: "14%", z: "80px", scale: "0.98", rotate: "-2deg", duration: "36s", delay: "-11s", band: "near" },
  { x: "78%", y: "17%", z: "-270px", scale: "0.68", rotate: "15deg", duration: "54s", delay: "-31s", band: "far" },
  { x: "6%", y: "27%", z: "30px", scale: "0.9", rotate: "10deg", duration: "42s", delay: "-23s", band: "mid" },
  { x: "46%", y: "25%", z: "-210px", scale: "0.72", rotate: "-8deg", duration: "52s", delay: "-5s", band: "far" },
  { x: "84%", y: "31%", z: "120px", scale: "1.06", rotate: "-5deg", duration: "34s", delay: "-17s", band: "near" },
  { x: "18%", y: "41%", z: "-150px", scale: "0.8", rotate: "-11deg", duration: "48s", delay: "-29s", band: "mid" },
  { x: "58%", y: "39%", z: "140px", scale: "1.04", rotate: "4deg", duration: "39s", delay: "-13s", band: "near" },
  { x: "73%", y: "48%", z: "-300px", scale: "0.66", rotate: "13deg", duration: "60s", delay: "-41s", band: "far" },
  { x: "2%", y: "56%", z: "-240px", scale: "0.7", rotate: "-16deg", duration: "57s", delay: "-3s", band: "far" },
  { x: "34%", y: "58%", z: "60px", scale: "0.95", rotate: "7deg", duration: "37s", delay: "-21s", band: "near" },
  { x: "66%", y: "61%", z: "-110px", scale: "0.84", rotate: "-10deg", duration: "50s", delay: "-9s", band: "mid" },
  { x: "88%", y: "66%", z: "50px", scale: "0.9", rotate: "9deg", duration: "44s", delay: "-33s", band: "mid" },
  { x: "12%", y: "73%", z: "110px", scale: "1.02", rotate: "3deg", duration: "35s", delay: "-15s", band: "near" },
  { x: "48%", y: "76%", z: "-330px", scale: "0.62", rotate: "-7deg", duration: "59s", delay: "-27s", band: "far" },
  { x: "78%", y: "82%", z: "-130px", scale: "0.82", rotate: "12deg", duration: "47s", delay: "-37s", band: "mid" },
  { x: "24%", y: "88%", z: "-260px", scale: "0.7", rotate: "-13deg", duration: "55s", delay: "-25s", band: "far" },
  { x: "52%", y: "91%", z: "100px", scale: "1", rotate: "5deg", duration: "38s", delay: "-1s", band: "near" },
  { x: "91%", y: "8%", z: "-210px", scale: "0.76", rotate: "-9deg", duration: "52s", delay: "-45s", band: "far" },
  { x: "39%", y: "4%", z: "30px", scale: "0.88", rotate: "6deg", duration: "41s", delay: "-35s", band: "mid" },
  { x: "4%", y: "84%", z: "-80px", scale: "0.82", rotate: "11deg", duration: "49s", delay: "-39s", band: "mid" },
  { x: "70%", y: "10%", z: "115px", scale: "1.02", rotate: "-4deg", duration: "36s", delay: "-47s", band: "near" },
  { x: "42%", y: "67%", z: "-200px", scale: "0.74", rotate: "14deg", duration: "53s", delay: "-43s", band: "far" },
] as const;

export function KineticTextField({
  lines = KINETIC_TEXT_LINES,
  paused,
  reducedMotion,
  phase,
  tone = "warm",
}: KineticTextFieldProps) {
  const lineSource = lines.length > 0 ? lines : KINETIC_TEXT_LINES;
  const fallbackLine: KineticTextLine = lineSource[0] ?? {
    tone: "classic",
    text: "六经注我",
  };

  return (
    <div
      aria-hidden="true"
      data-testid="kinetic-text-field"
      data-phase={phase}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className={`kinetic-text-stage kinetic-text-stage--${phase} kinetic-text-stage--${tone} ${
        paused ? "kinetic-text-stage--paused" : ""
      } ${reducedMotion ? "kinetic-text-stage--static" : ""}`}
    >
      <div className="kinetic-text-perspective">
        {FRAGMENT_LAYOUT.map((layout, index) => {
          const line = lineSource[index % lineSource.length] ?? fallbackLine;
          const style = {
            "--kinetic-x": layout.x,
            "--kinetic-y": layout.y,
            "--kinetic-z": layout.z,
            "--kinetic-scale": layout.scale,
            "--kinetic-rotate": layout.rotate,
            "--kinetic-duration": layout.duration,
            "--kinetic-delay": layout.delay,
          } as CSSProperties;

          return (
            <p
              key={`${line.text}-${index}`}
              data-depth={layout.band}
              className={`kinetic-text-line kinetic-text-line--${layout.band} kinetic-text-line--${line.tone}`}
              style={style}
            >
              {line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
