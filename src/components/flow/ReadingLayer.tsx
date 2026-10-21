'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FlowFrame, FlowSelection } from '@/lib/flow/contracts';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import { LinkedText } from './LinkedText';
import { NotesPanel } from './NotesPanel';
import styles from './flow.module.css';

type Selection = { frameId: string; anchorId?: string; selection?: FlowSelection; label: string };
type Props = {
  frame: FlowFrame;
  frames?: FlowFrame[];
  connecting?: Selection | null;
  notesFrameId?: string | null;
  pending?: boolean;
  canContinue?: boolean;
  onContinue?: () => void;
  onPrepareNext?: () => void;
  onReadFrame?: (frame: FlowFrame) => void;
  chainKind: 'curated' | 'remote';
  path: Array<{ pathId: string; label: string }>;
  sourceOpen: boolean;
  sourceScrollTop: number;
  readingScrollTop: number;
  seed: string;
  notes: PersonalNote[];
  savingNote: boolean;
  noteDraftKey?: string;
  waiting?: ReactNode;
  focusOnEntry?: boolean;
  onReturn: () => void;
  onToggleSource: () => void;
  onSourceScroll: (top: number) => void;
  onReadingScroll: (top: number) => void;
  onBranch: (selection: Selection) => void;
  onOpenSeed: () => void;
  onSaveNote: (text: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUndoNote: () => Promise<void>;
  onUpdateNote?: (id: string, text: string) => Promise<void>;
  onOpenPath?: (pathId: string) => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
};

export function ReadingLayer({ frame, frames, connecting = null, notesFrameId, pending = false, canContinue = false, onContinue, onPrepareNext, onReadFrame, chainKind, path, sourceOpen, sourceScrollTop, readingScrollTop, notes, savingNote, noteDraftKey, waiting, focusOnEntry = false, onReturn, onToggleSource, onSourceScroll, onReadingScroll, onBranch, onSaveNote, onDeleteNote, onUndoNote, onUpdateNote, onOpenPath, bookmarked, onBookmark }: Props) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const userScroll = useRef(false);
  const requestedAt = useRef(-1);
  const focusNext = useRef(false);
  const previousCount = useRef(frames?.length || 1);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const items = frames?.length ? frames : [frame];

  useEffect(() => {
    if (readingRef.current) readingRef.current.scrollTop = readingScrollTop;
  }, [readingScrollTop]);

  useEffect(() => {
    if (!focusOnEntry || document.activeElement !== document.body) return;
    const article = Array.from(readingRef.current?.querySelectorAll<HTMLElement>('[data-flow-frame]') || [])
      .find(item => item.dataset.flowFrame === frame.id);
    article?.querySelector<HTMLElement>('[data-flow-heading] button')?.focus({ preventScroll: true });
    // Only entry navigation moves focus; scrolling through appended text does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (notesFrameId) setNotesFor(notesFrameId); }, [notesFrameId]);
  useEffect(() => {
    if (!notesFrameId || notesFor !== notesFrameId) return;
    const id = requestAnimationFrame(() => readingRef.current?.querySelector('#flow-note-input')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [notesFrameId, notesFor]);

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = items.length;
    if (!focusNext.current || items.length <= previous) return;
    focusNext.current = false;
    const panel = readingRef.current;
    const next = panel?.querySelectorAll<HTMLElement>('[data-flow-frame]')[previous];
    if (panel && next) {
      next.querySelector<HTMLElement>('[data-flow-heading] button')?.focus({ preventScroll: true });
    }
  }, [items.length]);

  useEffect(() => {
    if (!sourceOpen) return;
    if (sourceRef.current) sourceRef.current.scrollTop = sourceScrollTop;
  }, [sourceOpen, frame.id, sourceScrollTop]);

  useEffect(() => {
    if (!sourceOpen || sourceScrollTop > 0) return;
    const target = sourceRef.current?.querySelector<HTMLElement>('[data-source-quote="true"]');
    const panel = sourceRef.current;
    if (target && panel) panel.scrollTop += target.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight / 2;
  }, [sourceOpen, frame.id, sourceScrollTop]);

  return (
    <section className={styles.readingLayer} aria-label="停驻阅读">
      <header className={styles.readingHeader}>
        <div>
          <p className={styles.eyebrow}>{frame.source} · {frame.chapterLabel}</p>
          {waiting}
        </div>
        <div className={styles.headerActions}>
          {path.length > 1 && <button className={styles.textButton} type="button" onClick={onReturn}>返回上条经文链</button>}
        </div>
      </header>
      <div ref={readingRef} className={styles.readingScroll}
        onWheel={() => { userScroll.current = true; focusNext.current = false; }} onTouchMove={() => { userScroll.current = true; focusNext.current = false; }}
        onKeyDown={event => { if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) { userScroll.current = true; focusNext.current = false; } }}
        onScroll={event => {
          const panel = event.currentTarget;
          onReadingScroll(panel.scrollTop);
          const articles = Array.from(panel.querySelectorAll<HTMLElement>('[data-flow-frame]'));
          const edge = panel.getBoundingClientRect().top + 36;
          const visible = articles.filter(article => article.getBoundingClientRect().top <= edge).at(-1) || articles[0];
          const next = items.find(item => item.id === visible?.dataset.flowFrame);
          const editing = panel.querySelector('textarea:focus, input:focus');
          if (next && next.id !== frame.id && !editing) onReadFrame?.(next);
          if (userScroll.current && !editing && !pending && canContinue &&
            panel.scrollTop + panel.clientHeight >= panel.scrollHeight - panel.clientHeight * 1.5) onPrepareNext?.();
          if (userScroll.current && !pending && canContinue && requestedAt.current !== items.length &&
            panel.scrollHeight > panel.clientHeight + 32 && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 96) {
            requestedAt.current = items.length;
            userScroll.current = false;
            onContinue?.();
          }
        }}>
        <p className={styles.wordHelp}>点选字词，沿此意继续。<span className={styles.keyboardHelp}> 左右方向键选词，回车展开。</span></p>
        {path.length > 1 && <details className={styles.connectedTrail}>
          <summary>来路 · {path[path.length - 1]?.label}</summary>
          <nav className={styles.pathTrail} aria-label="来路">
            {path.map((item, index) => <span key={item.pathId} aria-current={index === path.length - 1 ? 'step' : undefined}>{index < path.length - 1 && onOpenPath ? <button type="button" className={styles.textButton} onClick={() => onOpenPath(item.pathId)}>{item.label}</button> : item.label}</span>)}
          </nav>
        </details>}
        {items.map(item => {
          const current = item.id === frame.id;
          const select = (selection: Selection) => { onReadFrame?.(item); onBranch(selection); };
          return <article key={item.id} data-flow-frame={item.id} className={styles.connectedNode} aria-label={`${item.source} · ${item.chapterLabel}`}>
            <p className={styles.nodeSource}>{item.source} · {item.chapterLabel}</p>
            <blockquote className={styles.readerQuote} data-flow-heading>
              <LinkedText frame={item} surface="quote" onSelect={select} connecting={connecting} />
            </blockquote>
            <div className={styles.explanation}>
              {item.meaning && <div className={styles.meaning}><p className={styles.sectionLabel}>释义</p><p><LinkedText frame={item} surface="meaning" onSelect={select} connecting={connecting} /></p></div>}
              {(item.ready !== false || item.settled?.reflection) && item.reflection && <div className={styles.reflection}>
                <p className={styles.sectionLabel}>此刻的联系{chainKind === 'remote' ? ' · AI 生成' : ''}</p>
                <p><LinkedText frame={item} surface="reflection" onSelect={select} connecting={connecting} /></p>
              </div>}
            </div>
            <div className={styles.readerActions}>
              <button className={styles.quietButton} type="button" aria-expanded={current && sourceOpen} onClick={() => { onReadFrame?.(item); onToggleSource(); }}>{current && sourceOpen ? '收起原文' : '查看原文'}</button>
              {onBookmark && <button className={styles.textButton} type="button" aria-pressed={current && !!bookmarked} onClick={() => { onReadFrame?.(item); onBookmark(); }}>{current && bookmarked ? '已收藏' : '收藏'}</button>}
              <button className={styles.textButton} type="button" aria-expanded={current && notesFor === item.id} onClick={() => { onReadFrame?.(item); setNotesFor(notesFor === item.id ? null : item.id); }}>注脚{current && notes.length > 0 ? ` · ${notes.length}` : ''}</button>
            </div>
            {current && <>
              <div ref={sourceRef} onScroll={event => onSourceScroll(event.currentTarget.scrollTop)} className={`${styles.sourcePanel} ${sourceOpen ? styles.sourcePanelOpen : ''}`} aria-hidden={!sourceOpen}>
                <p className={styles.sectionLabel}>{frame.source} · {frame.chapterLabel} · 完整原文</p>
                <p className={styles.fullSource}><LinkedText frame={frame} surface="fullText" onSelect={select} connecting={connecting} /></p>
              </div>
              {notesFor === frame.id && <NotesPanel key={noteDraftKey || frame.id} {...(noteDraftKey ? { draftKey: noteDraftKey } : {})} notes={notes} saving={savingNote} onSave={onSaveNote} onDelete={onDeleteNote} onUndo={onUndoNote} {...(onUpdateNote ? { onUpdate: onUpdateNote } : {})} />}
            </>}
          </article>;
        })}
        {onContinue && <div className={styles.continueReading}>
          {canContinue ? <button className={styles.textButton} type="button" disabled={pending} onClick={() => { userScroll.current = false; focusNext.current = true; onContinue(); }}>{pending ? '正在接续…' : '沿此意继续'}</button>
            : !pending && <p className={styles.muted}>点选任一字词，继续下一处。</p>}
        </div>}
      </div>
    </section>
  );
}
