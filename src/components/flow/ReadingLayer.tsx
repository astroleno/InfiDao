'use client';

import { useEffect, useRef } from 'react';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import { LinkedText } from './LinkedText';
import { NotesPanel } from './NotesPanel';
import styles from './flow.module.css';

type Selection = { frameId: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; label: string };
type Props = {
  frame: FlowFrame;
  chainKind: 'curated' | 'remote';
  path: Array<{ pathId: string; label: string }>;
  sourceOpen: boolean;
  sourceScrollTop: number;
  readingScrollTop: number;
  seed: string;
  notes: PersonalNote[];
  savingNote: boolean;
  onReturn: () => void;
  onToggleSource: () => void;
  onSourceScroll: (top: number) => void;
  onReadingScroll: (top: number) => void;
  onBranch: (selection: Selection) => void;
  onOpenSeed: () => void;
  onSaveNote: (text: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUndoNote: () => Promise<void>;
};

export function ReadingLayer({ frame, chainKind, path, sourceOpen, sourceScrollTop, readingScrollTop, seed, notes, savingNote, onReturn, onToggleSource, onSourceScroll, onReadingScroll, onBranch, onOpenSeed, onSaveNote, onDeleteNote, onUndoNote }: Props) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (readingRef.current) readingRef.current.scrollTop = readingScrollTop;
  }, [readingScrollTop, frame.id]);

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
          <p className={styles.provenance}>{chainKind === 'curated' ? '本地精选' : '生成联系'}</p>
        </div>
        <div className={styles.headerActions}>
          {path.length > 1 && <button className={styles.textButton} type="button" onClick={onReturn}>返回上条经文链</button>}
        </div>
      </header>

      <div ref={readingRef} className={styles.readingScroll} onScroll={event => onReadingScroll(event.currentTarget.scrollTop)}>
        <blockquote className={styles.readerQuote}>
          <LinkedText frame={frame} surface="quote" onSelect={onBranch} />
        </blockquote>
        <p className={styles.wordHelp}>点选经文中的字词可接续；键盘用左右方向键选词，回车展开。</p>
        <div className={styles.explanation}>
          <p className={styles.sectionLabel}>原文之义</p>
          <p><LinkedText frame={frame} surface="meaning" onSelect={onBranch} /></p>
          {frame.reflection && <>
            <p className={styles.sectionLabel}>与你此刻的联系</p>
            <p><LinkedText frame={frame} surface="reflection" onSelect={onBranch} /></p>
          </>}
        </div>

        <div className={styles.readerActions}>
          <button className={styles.quietButton} type="button" aria-expanded={sourceOpen} onClick={onToggleSource}>{sourceOpen ? '收起原文' : '查看原文'}</button>
          <button className={styles.quietButton} type="button" onClick={onOpenSeed}>此刻的一念</button>
        </div>

        <div ref={sourceRef} onScroll={event => onSourceScroll(event.currentTarget.scrollTop)} className={`${styles.sourcePanel} ${sourceOpen ? styles.sourcePanelOpen : ''}`} aria-hidden={!sourceOpen}>
          <p className={styles.sectionLabel}>{frame.source} · {frame.chapterLabel} · 完整原文</p>
          <p className={styles.fullSource}><LinkedText frame={frame} surface="fullText" onSelect={onBranch} /></p>
        </div>

        <nav className={styles.pathTrail} aria-label="来路">
          <span>来路</span>
          {path.map((item, index) => <span key={item.pathId} aria-current={index === path.length - 1 ? 'step' : undefined}>{item.label}</span>)}
        </nav>

        <NotesPanel key={frame.id} notes={notes} saving={savingNote} onSave={onSaveNote} onDelete={onDeleteNote} onUndo={onUndoNote} />
      </div>
    </section>
  );
}
