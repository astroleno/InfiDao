'use client';

import { Fragment, useId, useRef, useState } from 'react';
import type { FlowFrame, FlowSelection } from '@/lib/flow/contracts';
import styles from './flow.module.css';

const { classicSpans } = require('../../../shared/flow/classic-text') as {
  classicSpans: (frame: FlowFrame, surface?: 'quote' | 'fullText') => Array<{ text: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; selected?: boolean }>;
};
const { textSpans } = require('../../../shared/flow/text-spans') as {
  textSpans: (frame: FlowFrame, surface: string, allWords?: boolean) => Part[];
};

type Selection = { frameId: string; anchorId?: string; selection?: FlowSelection; label: string };
type Part = { text: string; anchorId?: string; selection?: FlowSelection; selected?: boolean };
type TokenGroup = Array<{ part: Part; index: number }>;

const tokenText = (group: TokenGroup) => group.map(item => item.part.text).join('');
const shortHan = /^\p{Script=Han}{1,2}$/u;

// Keep short particles with the words they introduce or close. Each canonical
// link and optical glyph run still has its own node within the layout group.
function quotePhrases(groups: TokenGroup[]) {
  const phrases: TokenGroup[][] = [];
  for (const [index, group] of groups.entries()) {
    const previous = phrases.at(-1);
    const previousGroup = previous?.at(-1);
    const leading = previousGroup ? tokenText(previousGroup) : '';
    const preceding = previous?.map(tokenText).join('') || '';
    const ending = tokenText(group);
    const word = ending.replace(/[\p{P}]+$/u, '');
    const joined = preceding + ending;
    const followsParticle = /^[于於乎以与與及而则則乃若欲将將不未勿毋先]$/u.test(leading);
    const closesClause = index === groups.length - 1 && /^[之也矣焉哉耳兮耶乎欤歟][\p{P}]*$/u.test(ending);
    const namesTerm = (/[谓謂]$/u.test(leading) && /^之\p{Script=Han}{0,2}$/u.test(word))
      || (/[谓謂]之$/u.test(preceding) && shortHan.test(word));
    if (previous && (followsParticle || closesClause || namesTerm) && Array.from(joined).length <= 5) previous.push(group);
    else phrases.push([group]);
  }

  // Reserve room for a short ending during normal browser line wrapping.
  // A complete phrase such as 谓之静 can already form a readable final line.
  while (phrases.length > 1) {
    const tail = phrases.at(-1)!;
    const beforeTail = phrases.at(-2)!;
    const tailText = tail.map(tokenText).join('');
    const preceding = beforeTail.map(tokenText).join('');
    if (!shortHan.test(tailText.replace(/[\p{P}]+$/u, '')) || !/^\p{Script=Han}+$/u.test(preceding)
      || Array.from(preceding + tailText).length > 5) break;
    beforeTail.push(...tail);
    phrases.pop();
  }
  return phrases;
}

type Props = { frame: FlowFrame; surface: 'quote' | 'fullText' | 'meaning' | 'reflection'; onSelect: (selection: Selection) => void; connecting?: Pick<Selection, 'frameId' | 'anchorId'> | null; optical?: boolean };

export function LinkedText({ frame, surface, onSelect, connecting, optical = false }: Props) {
  const parts: Part[] = surface === 'quote' || surface === 'fullText' ? classicSpans(frame, surface) : textSpans(frame, surface, true);
  const helpId = useId();
  const groupRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState<{ frameId: string; index: number } | null>(null);
  const first = parts.findIndex(part => part.anchorId);
  const current = focused?.frameId === frame.id && parts[focused.index]?.anchorId ? focused.index : first;
  // Keep punctuation beside its word visually, without changing canonical
  // selection ranges, button labels, or the original text sequence.
  const groups: TokenGroup[] = [];
  let opening = '';
  parts.forEach((part, index) => {
    if (part.anchorId) {
      groups.push([...(opening ? [{ part: { text: opening }, index: -index - 1 }] : []), { part, index }]);
      opening = '';
      return;
    }
    const closing = part.text.match(/^[，。！？；：、,.!?;:」』）】》〉”’…]+/u)?.[0] || '';
    if (closing && groups.length) groups[groups.length - 1]!.push({ part: { text: closing }, index });
    let rest = closing && groups.length ? part.text.slice(closing.length) : part.text;
    const nextOpening = rest.match(/[「『（【《〈“‘]+$/u)?.[0] || '';
    rest = rest.slice(0, rest.length - nextOpening.length);
    if (opening || rest) groups.push([{ part: { text: opening + rest }, index }]);
    opening = nextOpening;
  });
  if (opening) groups.push([{ part: { text: opening }, index: parts.length }]);
  const clauses: Array<typeof groups> = [];
  for (const group of groups) {
    if (!clauses.length) clauses.push([]);
    clauses[clauses.length - 1]!.push(group);
    if (surface === 'quote' && /[，。！？；][」』）】》〉”’]*$/u.test(tokenText(group))) clauses.push([]);
  }
  return (
    <span ref={groupRef} role={first >= 0 ? 'group' : undefined} aria-label={first >= 0 ? '经文接续选词' : undefined} aria-describedby={first >= 0 ? helpId : undefined}
      className={surface === 'quote' || surface === 'fullText' ? styles.classicText : undefined}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        buttons[next]?.focus();
      }}>
      {first >= 0 && <span id={helpId} className={styles.srOnly}>左右方向键选词，Home 和 End 到首尾，回车接续，Tab 离开选词。</span>}
      {clauses.filter(clause => clause.length).map((clause, clauseIndex) => <span key={clauseIndex} className={surface === 'quote' ? styles.quoteClause : undefined}>{(optical && surface === 'quote' ? quotePhrases(clause) : [clause]).map((phrase, phraseIndex) => {
        const words = phrase.map((group, groupIndex) => <span key={groupIndex} data-flow-optic={optical || undefined} className={optical || group.some(item => item.part.anchorId) ? styles.tokenGroup : undefined}>{group.map(({ part, index }) => {
        if (!part.anchorId) return <span key={`${index}:${part.text}`} data-source-quote={part.selected || undefined} className={part.selected ? styles.selectedQuote : undefined}>{part.text}</span>;
        const choose = () => {
          const selected: Selection = { frameId: frame.id, label: part.text };
          if (part.anchorId) selected.anchorId = part.anchorId;
          if (part.selection) selected.selection = part.selection;
          onSelect(selected);
        };
        return (
          <button key={`${index}:${part.anchorId}`} tabIndex={index === current ? 0 : -1} onFocus={() => setFocused({ frameId: frame.id, index })} title={`沿「${part.text}」接续`} data-source-quote={part.selected || undefined} data-connecting={connecting?.frameId === frame.id && connecting.anchorId === part.anchorId || undefined} className={`${styles.linkedToken} ${part.selected ? styles.selectedQuote : ''}`} type="button" onClick={choose}>
            {part.text}
          </button>
        );
        })}</span>);
        return optical && surface === 'quote' && phrase.length > 1
          ? <span key={phraseIndex} className={styles.quotePhrase}>{words}</span>
          : <Fragment key={phraseIndex}>{words}</Fragment>;
      })}</span>)}
    </span>
  );
}
