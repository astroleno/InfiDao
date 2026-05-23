export type KineticTextTone = "classic" | "thought" | "response";

export interface KineticTextLine {
  text: string;
  tone: KineticTextTone;
}

export interface FrictionDirection {
  id: "cultivation" | "relation" | "change";
  label: string;
  description: string;
}

export const KINETIC_TEXT_LINES: KineticTextLine[] = [
  { tone: "classic", text: "大学之道，在明明德" },
  { tone: "thought", text: "我此刻如何把心收回来" },
  { tone: "response", text: "知止而后有定" },
  { tone: "classic", text: "苟日新，日日新，又日新" },
  { tone: "thought", text: "一句话出口之前，还能怎样选择" },
  { tone: "response", text: "先定其分，再观其变" },
  { tone: "classic", text: "君子不重则不威" },
  { tone: "thought", text: "纷扰里先守住一念" },
  { tone: "response", text: "主忠信，过则勿惮改" },
  { tone: "classic", text: "恻隐之心，仁之端也" },
  { tone: "thought", text: "看见他人，也照见自身" },
  { tone: "response", text: "从不忍处，起一小步" },
  { tone: "classic", text: "喜怒哀乐之未发，谓之中" },
  { tone: "thought", text: "情绪未出口前，仍有余地" },
  { tone: "response", text: "发而皆中节，谓之和" },
  { tone: "classic", text: "高山仰止，景行行止" },
  { tone: "thought", text: "把目光放高，把脚步落实" },
  { tone: "response", text: "不必一次抵达，先让一念成行" },
  { tone: "classic", text: "天行健，君子以自强不息" },
  { tone: "thought", text: "今日仍可推进哪一小步" },
  { tone: "response", text: "由此入经，由此回身" },
];

export const FRICTION_DIRECTIONS: FrictionDirection[] = [
  {
    id: "cultivation",
    label: "修身",
    description: "从内在修养、行为节制与注意力回收处入经。",
  },
  {
    id: "relation",
    label: "处世",
    description: "从关系、时机、言语与义务的分寸处入经。",
  },
  {
    id: "change",
    label: "观变",
    description: "从变化、格局、后果与不确定处入经。",
  },
];
