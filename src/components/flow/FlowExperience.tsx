'use client';

import { useEffect, useRef, useState } from 'react';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { BrowserFlowBatch } from '@/lib/flow-browser/provider';
import { createBrowserController, type FlowController, type ControllerState } from '@/lib/flow-browser/controller-host';
import { shouldPrefetchFlow } from '@/lib/flow-browser/prefetch';
import { observeFlowViewport } from '@/lib/flow-browser/viewport';
import { createPathId, deleteNote, listNotes, loadPath, restoreNote, saveNote, loadDraft, saveDraft, type FlowPathRecord, type PersonalNote, type ReadingSnapshot } from '@/lib/flow-browser/storage';
import type { FlowRendererHost } from '@/lib/flow-browser/renderer-host';
import { ReadingLayer } from './ReadingLayer';
import { SeedSheet } from './SeedSheet';
import { WheelCanvas } from './WheelCanvas';
import { FlowWaiting } from './FlowWaiting';
import styles from './flow.module.css';

type Selection = { frameId: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; label: string };
type TrailItem = { pathId: string; label: string };

const { CELL, CENTER_PHASE } = require('../../../shared/flow/timeline') as { CELL: number; CENTER_PHASE: number };

function initialSnapshot(paused: boolean): ReadingSnapshot {
  return { position: CELL * CENTER_PHASE, rowOffset: 0, ambientPhase: 0, paused, sourceOpen: false, readingPositions: {}, ribbon: null, version: 1 };
}

export function FlowExperience() {
  const experienceRef = useRef<HTMLElement>(null);
  const [chain, setChain] = useState<BrowserFlowBatch | null>(null);
  const [frames, setFrames] = useState<FlowFrame[]>([]);
  const [active, setActive] = useState<FlowFrame | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [flowError, setFlowError] = useState<ControllerState['error']>(null);
  const [notice, setNotice] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceScrollTop, setSourceScrollTop] = useState(0);
  const [readingScrollTop, setReadingScrollTop] = useState(0);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedError, setSeedError] = useState('');
  const [seed, setSeed] = useState('');
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  const controllerRef = useRef<FlowController | null>(null);
  const chainRef = useRef<BrowserFlowBatch | null>(null);
  const recordRef = useRef<FlowPathRecord | null>(null);
  const snapshotRef = useRef<ReadingSnapshot>(initialSnapshot(false));
  const sourceOpenRef = useRef(false);
  const sourceScrollRef = useRef(0);
  const readingScrollRef = useRef(0);
  const draftVersionRef = useRef(0);
  const seedRequestRef = useRef(0);
  const frameRef = useRef<FlowFrame | null>(null);
  const undoNoteRef = useRef<PersonalNote | null>(null);
  const lastSelectionRef = useRef<Selection | null>(null);
  const wheelHostRef = useRef<FlowRendererHost | null>(null);
  const reducedRef = useRef(false);

  chainRef.current = chain;
  reducedRef.current = reducedMotion;

  function captureSnapshot() {
    const latest = wheelHostRef.current?.snapshot() || snapshotRef.current;
    return { ...latest, sourceOpen: sourceOpenRef.current,
      readingPositions: { ...snapshotRef.current.readingPositions,
        source: sourceScrollRef.current, reader: readingScrollRef.current } };
  }

  async function collectTrail(record: FlowPathRecord): Promise<TrailItem[]> {
    const trail: TrailItem[] = [];
    const visited = new Set<string>();
    let current: FlowPathRecord | null = record;
    while (current && !visited.has(current.pathId)) {
      visited.add(current.pathId);
      trail.unshift({ pathId: current.pathId, label: current.sourceLabel });
      current = current.parentPathId ? await loadPath(current.parentPathId) : null;
    }
    return trail;
  }

  function present(record: FlowPathRecord) {
    lastSelectionRef.current = null;
    const nextChain = record.chain as BrowserFlowBatch;
    recordRef.current = record;
    chainRef.current = nextChain;
    snapshotRef.current = record.snapshot;
    sourceOpenRef.current = record.snapshot.sourceOpen;
    sourceScrollRef.current = record.snapshot.readingPositions.source || 0;
    readingScrollRef.current = record.snapshot.readingPositions.reader || 0;
    setChain(nextChain);
    setFrames(nextChain.frames);
    frameRef.current = nextChain.frames[0] || null;
    setActive(frameRef.current);
    setPaused(reducedRef.current || record.snapshot.paused);
    setSourceOpen(record.snapshot.sourceOpen);
    setSourceScrollTop(sourceScrollRef.current);
    setReadingScrollTop(readingScrollRef.current);
    setNotice('');
    void collectTrail(record).then(trail => { if (recordRef.current?.pathId === record.pathId) setPathTrail(trail); });
  }

  const [pathTrail, setPathTrail] = useState<TrailItem[]>([]);

  useEffect(() => {
    if (experienceRef.current) return observeFlowViewport(experienceRef.current);
    return undefined;
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reducedRef.current = media.matches;
      setReducedMotion(media.matches);
      if (media.matches) {
        setPaused(true);
        wheelHostRef.current?.setPaused(true);
      }
    };
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = createBrowserController({
      capture: captureSnapshot,
      initialSnapshot: (_chain, context) => initialSnapshot(reducedRef.current || !!context.parentSnapshot?.paused),
      present(record) { if (alive) present(record); },
      update(record) {
        if (!alive) return;
        recordRef.current = record;
        chainRef.current = record.chain;
        setChain(record.chain); setFrames(record.chain.frames);
        frameRef.current = record.chain.frames.find((frame: FlowFrame) => frame.id === frameRef.current?.id) || record.chain.frames[0] || null;
        setActive(frameRef.current);
      },
      state(state) {
        if (!alive) return;
        setBusy(state.busy); setPending(state.pending); setFlowError(state.error);
        setLoading(!state.record && state.pending);
        if (state.storageWarning) setStorageWarning(true);
      },
    });
    controllerRef.current = controller;
    const draftVersion = draftVersionRef.current;
    void loadDraft().then(draft => { if (alive && draftVersion === draftVersionRef.current && draft !== null) setSeed(draft); });
    void controller.start();
    const checkpoint = () => { void controller.checkpoint().catch(() => { if (alive) setStorageWarning(true); }); };
    const hide = () => controller.setVisible(false);
    const show = () => controller.setVisible(document.visibilityState !== 'hidden');
    const interval = window.setInterval(checkpoint, 2500);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    document.addEventListener('visibilitychange', show);
    return () => {
      checkpoint(); alive = false; controller.dispose(); controllerRef.current = null; recordRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      document.removeEventListener('visibilitychange', show);
    };
    // The shared controller owns requests and navigation for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chain || !active) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    listNotes(chain.chainId, active.id).then(value => { if (!cancelled) setNotes(value); });
    return () => { cancelled = true; };
  }, [chain, active]);

  async function handleBranch(selection: Selection) {
    setNotice('');
    lastSelectionRef.current = selection;
    await controllerRef.current?.branch(selection);
  }

  function handleActiveChange(line: FlowFrame) {
    const current = chainRef.current;
    if (!current) return;
    const passageId = (line as FlowFrame & { passageId?: string }).passageId || line.id;
    const canonical = current.frames.find(frame => frame.id === passageId);
    if (!canonical) return;
    const movedToAnotherFrame = frameRef.current?.id !== canonical.id;
    if (movedToAnotherFrame) {
      const positions = snapshotRef.current.readingPositions;
      const key = canonical.id;
      sourceScrollRef.current = positions[key + ':source'] || 0;
      readingScrollRef.current = positions[key + ':reader'] || 0;
      setSourceScrollTop(sourceScrollRef.current); setReadingScrollTop(readingScrollRef.current);
    }
    frameRef.current = canonical;
    setActive(canonical);
    if (shouldPrefetchFlow({ ordinal: canonical.ordinal, lastOrdinal: current.frames[current.frames.length - 1]!.ordinal,
      frameCount: current.frames.length, moved: movedToAnotherFrame, paused, reducedMotion: reducedRef.current })) {
      void controllerRef.current?.next();
    }
  }

  function updateSnapshot(next: ReadingSnapshot) {
    snapshotRef.current = { ...next, sourceOpen: sourceOpenRef.current,
      readingPositions: { ...snapshotRef.current.readingPositions, source: sourceScrollRef.current, reader: readingScrollRef.current } };
  }

  function onToggleSource() {
    const next = !sourceOpenRef.current;
    sourceOpenRef.current = next;
    setSourceOpen(next);
    snapshotRef.current = { ...snapshotRef.current, sourceOpen: next };
  }

  async function startThought() {
    const controller = controllerRef.current;
    if (!controller || busy || pending) return;
    const request = ++seedRequestRef.current;
    setNotice('');
    setSeedError('');
    lastSelectionRef.current = null;
    await controller.open(seed);
    if (request !== seedRequestRef.current) return;
    const error = controller.getState().error;
    if (error) setSeedError(error.message);
    else setSeedOpen(false);
  }

  function openSeed() { setSeedError(''); setSeedOpen(true); }
  function cancelSeed() {
    seedRequestRef.current++;
    controllerRef.current?.cancel();
  }
  function closeSeed() {
    seedRequestRef.current++;
    if (busy || pending) controllerRef.current?.cancel();
    setSeedOpen(false);
  }

  function changeDraft(value: string) {
    draftVersionRef.current++;
    setSeed(value);
    void saveDraft(value).then(result => { if (!result.persisted) setStorageWarning(true); });
  }

  function returnToParent() {
    controllerRef.current?.returnToParent();
  }

  async function onSaveNote(text: string) {
    if (!chain || !active) return;
    setSavingNote(true);
    const now = Date.now();
    const result = await saveNote({ id: createPathId(), chainId: chain.chainId, frameId: active.id, text, createdAt: now, updatedAt: now });
    await refreshNotes(chain.chainId, active.id);
    if (!result.persisted) setStorageWarning(true);
    setSavingNote(false);
  }

  async function onDeleteNote(id: string) {
    const result = await deleteNote(id);
    if (result.deleted && result.previous) undoNoteRef.current = result.previous;
    if (!result.persisted) setStorageWarning(true);
    if (chain && active) await refreshNotes(chain.chainId, active.id);
  }

  async function onUndoNote() {
    const note = undoNoteRef.current;
    if (!note) return;
    const result = await restoreNote(note);
    if (!result.persisted) setStorageWarning(true);
    undoNoteRef.current = null;
    if (chain && active) await refreshNotes(chain.chainId, active.id);
  }

  async function refreshNotes(chainId: string, frameId: string) {
    const value = await listNotes(chainId, frameId);
    if (chainRef.current?.chainId === chainId && frameRef.current?.id === frameId) setNotes(value);
  }

  function toggleFlow() {
    if (wheelHostRef.current) wheelHostRef.current.togglePause();
    else setPaused(!paused);
  }

  const currentFrame = active || frames[0] || null;

  return (
    <main ref={experienceRef} className={styles.experience}>
      <div className={styles.experienceContent}>
      <div className={styles.topBar}>
        <h1 className={styles.brand}>六经注我</h1>
        <div className={styles.topActions}>
          <button className={styles.topButton} type="button" onClick={openSeed}>此刻的一念</button>
          <button className={styles.topButton} type="button" onClick={toggleFlow} aria-pressed={paused}>{paused ? '继续流动' : '停驻阅读'}</button>
        </div>
      </div>

      <WheelCanvas frames={frames} active={currentFrame} chainId={chain?.chainId || ''} snapshot={chain ? snapshotRef.current : null}
        paused={paused} reducedMotion={reducedMotion} onSelect={selection => void handleBranch(selection)}
        onPauseChange={setPaused} onActiveChange={frame => void handleActiveChange(frame)} onSnapshot={updateSnapshot}
        onHostReady={host => { wheelHostRef.current = host; }} />

      {loading && <p className={styles.loadingLabel} role="status">正在准备经文与字形…</p>}
      {pending && !seedOpen && !(paused && currentFrame && !loading) && <FlowWaiting floating busy={busy} label={lastSelectionRef.current?.label} onCancel={() => controllerRef.current?.cancel()} />}
      {flowError && <div className={styles.notice} role="status">
        <p>{flowError.message}</p>
        {['CHAIN_EXPIRED', 'CORPUS_CHANGED', 'CONNECTION_REQUIRED'].includes(flowError.code)
          ? <button className={styles.textButton} type="button" onClick={() => void controllerRef.current?.restart(lastSelectionRef.current || (currentFrame ? { frameId: currentFrame.id } : undefined))}>{lastSelectionRef.current?.selection ? '沿原词重新展开' : '从原句重新展开'}</button>
          : <button className={styles.textButton} type="button" onClick={() => void controllerRef.current?.retry()}>重试</button>}
        <button className={styles.textButton} type="button" onClick={() => controllerRef.current?.dismissError()}>留在原句</button>
      </div>}
      {notice && !busy && !flowError && <p className={styles.notice} role="status">{notice}</p>}
      {storageWarning && <p className={styles.storageNotice} role="status">本机存储暂不可用；当前阅读仍可继续，刷新后可能无法恢复。</p>}

      {paused && currentFrame && !loading && (
        <ReadingLayer frame={currentFrame} chainKind={chain?.kind === 'remote' ? 'remote' : 'curated'} path={pathTrail}
          waiting={pending && !seedOpen ? <FlowWaiting busy={busy} label={lastSelectionRef.current?.label} onCancel={() => controllerRef.current?.cancel()} /> : undefined}
          sourceOpen={sourceOpen} sourceScrollTop={sourceScrollTop} readingScrollTop={readingScrollTop} seed={chain?.seed || ''} notes={notes} savingNote={savingNote}
          onReturn={returnToParent} onToggleSource={onToggleSource} onSourceScroll={top => {
            sourceScrollRef.current = top;
            snapshotRef.current = { ...snapshotRef.current, readingPositions: { ...snapshotRef.current.readingPositions, source: top, [currentFrame.id + ':source']: top } };
          }} onReadingScroll={top => {
            readingScrollRef.current = top;
            snapshotRef.current = { ...snapshotRef.current, readingPositions: { ...snapshotRef.current.readingPositions, reader: top, [currentFrame.id + ':reader']: top } };
          }} onBranch={selection => void handleBranch(selection)} onOpenSeed={openSeed}
          onSaveNote={onSaveNote} onDeleteNote={onDeleteNote} onUndoNote={onUndoNote} />
      )}

      <span className={styles.srOnly} aria-live="polite">{currentFrame ? `${currentFrame.source}，${currentFrame.chapterLabel}。${currentFrame.quote}` : ''}</span>
      </div>
      <SeedSheet open={seedOpen} value={seed} busy={busy || pending} waitingForHead={busy} error={seedError} onChange={changeDraft} onSubmit={() => void startThought()} onClose={closeSeed} onCancel={cancelSeed} />
    </main>
  );
}
