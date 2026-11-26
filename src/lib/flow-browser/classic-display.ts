import data from './classic-display.generated.json';

type Projection = { text: string; slice: (start: number, end: number) => string | null };
const { createClassicProjector } = require('./classic-display-projector.cjs') as {
  createClassicProjector: (data: typeof import('./classic-display.generated.json')) => (text: string) => Projection | null;
};

const project = createClassicProjector(data);
const cache = new Map<string, Projection | null>();

export function projectClassicText(text: string) {
  if (!cache.has(text)) {
    cache.set(text, project(text));
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return cache.get(text) ?? null;
}

type Quotation = { quote: string; fullText?: string; quoteStart?: number; quoteEnd?: number };

export function displayClassicQuote(frame: Quotation): string {
  const { fullText, quote, quoteStart, quoteEnd } = frame;
  if (typeof fullText !== 'string' || quoteStart === undefined || quoteEnd === undefined ||
    !Number.isInteger(quoteStart) || !Number.isInteger(quoteEnd) || quoteStart < 0 ||
    quoteEnd > fullText.length || fullText.slice(quoteStart, quoteEnd) !== quote) return quote;
  return projectClassicText(fullText)?.slice(quoteStart, quoteEnd) ?? quote;
}

export function displayClassicText(text: string): string {
  return projectClassicText(text)?.text ?? text;
}
