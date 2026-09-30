'use client';

import { useId, useRef, useState } from 'react';
import type { FlowFrame } from '@/lib/flow/contracts';
import styles from './flow.module.css';

const { classicSpans } = require('../../../shared/flow/classic-text') as {
  classicSpans: (frame: FlowFrame, surface?: 'quote' | 'fullText') => Array<{ text: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; selected?: boolean }>;
};
const { textSpans } = require('../../../shared/flow/text-spans') as {
  textSpans: (frame: FlowFrame, surface: string) => Array<{ text: string; anchorId?: string; selected?: boolean }>;
};

type Selection = { frameId: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; label: string };
type Part = { text: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; selected?: boolean };

type Props = { frame: FlowFrame; surface: 'quote' | 'fullText' | 'meaning' | 'reflection'; onSelect: (selection: Selection) => void };

export function LinkedText({ frame, surface, onSelect }: Props) {
  const parts: Part[] = surface === 'quote' || surface === 'fullText' ? classicSpans(frame, surface) : textSpans(frame, surface);
  const helpId = useId();
  const groupRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState<{ frameId: string; index: number } | null>(null);
  const first = parts.findIndex(part => part.anchorId);
  const current = focused?.frameId === frame.id && parts[focused.index]?.anchorId ? focused.index : first;
  // Keep punctuation beside its word visually, without changing canonical
  // selection ranges, button labels, or the original text sequence.
  const groups: Array<Array<{ part: Part; index: number }>> = [];
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
      {groups.map((group, groupIndex) => <span key={groupIndex} className={group.some(item => item.part.anchorId) ? styles.tokenGroup : undefined}>{group.map(({ part, index }) => {
        if (!part.anchorId) return <span key={`${index}:${part.text}`} data-source-quote={part.selected || undefined} className={part.selected ? styles.selectedQuote : undefined}>{part.text}</span>;
        const choose = () => {
          const selected: Selection = { frameId: frame.id, label: part.text };
          if (part.anchorId) selected.anchorId = part.anchorId;
          if (part.selection) selected.selection = part.selection;
          onSelect(selected);
        };
        return (
          <button key={`${index}:${part.anchorId}`} tabIndex={index === current ? 0 : -1} onFocus={() => setFocused({ frameId: frame.id, index })} title={`沿「${part.text}」接续`} data-source-quote={part.selected || undefined} className={`${styles.linkedToken} ${part.selected ? styles.selectedQuote : ''}`} type="button" onClick={choose}>
            {part.text}
          </button>
        );
      })}</span>)}
    </span>
  );
}
