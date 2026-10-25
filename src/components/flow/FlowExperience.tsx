'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FlowFrame, FlowSelection as TextSelection } from '@/lib/flow/contracts';
import type { BrowserFlowBatch } from '@/lib/flow-browser/provider';
import { createBrowserController, type FlowController, type ControllerState } from '@/lib/flow-browser/controller-host';
import { observeFlowViewport } from '@/lib/flow-browser/viewport';
import { createPathId, deleteNote, listNotes, loadPath, restoreNote, saveNote, loadDraft, saveDraft, type FlowPathRecord, type PersonalNote, type ReadingSnapshot } from '@/lib/flow-browser/storage';
import { connectedRecords, entryKey, streamEntries, type StreamEntry } from '@/lib/flow-browser/continuity';
import { FlowStream } from './FlowStream';
import { SeedSheet } from './SeedSheet';
import { FlowResume, FlowWaiting } from './FlowWaiting';
import { LibrarySheet } from './LibrarySheet';
import { FlowLoading } from './FlowLoading';
import { prepareFlowFonts, type FontProgress } from '@/lib/flow-browser/fonts';
import { readingStorage } from '@/lib/flow-browser/storage';
import { noteContext, quoteKey, snapshotFrame, type SavedTarget } from '@/lib/flow-browser/library';
import { useMotionCandidate } from '@/lib/flow-browser/motion-candidate';
import type { KeepsakeSource } from '@/lib/handwriting/contracts';
import styles from './flow.module.css';

type Selection = { pathId?: string; frameId: string; anchorId?: string; selection?: TextSelection; label: string };
const ReadingKeepsakeSheet = dynamic(() => import('./ReadingKeepsakeSheet').then(module => module.ReadingKeepsakeSheet), { ssr: false });

const { CELL, CENTER_PHASE } = require('../../../shared/flow/timeline') as { CELL: number; CENTER_PHASE: number };

function initialSnapshot(paused: boolean): ReadingSnapshot {
  return { position: CELL * CENTER_PHASE, rowOffset: 0, ambientPhase: 0, paused, sourceOpen: false, readingPositions: {}, ribbon: null, version: 1 };
}

export function FlowExperience() {
  const motion = useMotionCandidate();
  const experienceRef = useRef<HTMLElement>(null);
  const [chain, setChain] = useState<BrowserFlowBatch | null>(null);
  const [records, setRecords] = useState<FlowPathRecord[]>([]);
  const entries = useMemo(() => streamEntries(records), [records]);
  const frames = chain?.frames || [];
  const [active, setActive] = useState<FlowFrame | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fontProgress, setFontProgress] = useState<FontProgress>({ phase: 'manifest', loaded: 0, total: 0 });
  const [preparingQuote, setPreparingQuote] = useState('');
  const [firstVisualReady, setFirstVisualReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [flowError, setFlowError] = useState<ControllerState['error']>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [restorePosition, setRestorePosition] = useState<{ revision: number; top: number; frameId?: string; entryKey?: string; source?: boolean }>({ revision: 0, top: 0 });
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedError, setSeedError] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);
  const [seed, setSeed] = useState('');
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [keepsakeSource, setKeepsakeSource] = useState<KeepsakeSource | null>(null);
  const keepsakePause = useRef(true);
  const keepsakeOpening = useRef(0);
  const [bookmarkKeys, setBookmarkKeys] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState(false);
  const [connecting, setConnecting] = useState<Selection | null>(null);
  const [notesFrameId, setNotesFrameId] = useState<string | null>(null);
  const libraryPause = useRef(true);
  const seedPause = useRef(false);
  const seedOrigin = useRef<string | null>(null);
  const seedOpenRef = useRef(false);
  const seedSubmitting = useRef(false);
  const submittedDraft = useRef<{ version: number; value: string } | null>(null);
  const seedTarget = useRef<{ pathId: string; frameId: string } | null>(null);
  const libraryRestored = useRef(false);
  const savingBookmark = useRef(false);
  const bookmarkVersion = useRef(0);
  const savingNoteId = useRef<{ id: string; chainId: string; frameId: string; createdAt: number } | null>(null);

  const controllerRef = useRef<FlowController | null>(null);
  const recordRef = useRef<FlowPathRecord | null>(null);
  const recordsRef = useRef<FlowPathRecord[]>([]);
  const entriesRef = useRef<StreamEntry[]>([]);
  const activeEntryRef = useRef<StreamEntry | null>(null);
  const snapshotRef = useRef<ReadingSnapshot>(initialSnapshot(false));
  const sourceOpenRef = useRef(false);
  const readingScrollRef = useRef(0);
  const draftVersionRef = useRef(0);
  const seedRequestRef = useRef(0);
  const frameRef = useRef<FlowFrame | null>(null);
  const undoNoteRef = useRef<PersonalNote | null>(null);
  const lastSelectionRef = useRef<Selection | null>(null);
  const reducedRef = useRef(false);
  const pausedRef = useRef(false);

  reducedRef.current = reducedMotion;
  pausedRef.current = paused;
  recordsRef.current = records;
  entriesRef.current = entries;

  function captureSnapshot() {
    return { ...snapshotRef.current, paused: pausedRef.current, ...(frameRef.current ? { activeFrameId: frameRef.current.id } : {}),
      ...(activeEntryRef.current ? { activeEntryKey: entryKey(activeEntryRef.current) } : {}), sourceOpen: sourceOpenRef.current,
      readingPositions: { ...snapshotRef.current.readingPositions,
        reader: readingScrollRef.current, ...(frameRef.current ? { [frameRef.current.id + ':reader']: readingScrollRef.current } : {}),
        ...(activeEntryRef.current ? { [entryKey(activeEntryRef.current) + ':reader']: readingScrollRef.current } : {}) } };
  }

  function pauseReading(next = true) {
    pausedRef.current = next;
    snapshotRef.current = { ...snapshotRef.current, paused: next };
    setPaused(next);
  }

  async function present(record: FlowPathRecord, context: { current: () => boolean; navigation: string }) {
    const nextRecords = await connectedRecords(record, loadPath);
    if (!context.current()) return;
    const nextEntries = streamEntries(nextRecords);
    const preserve = context.navigation === 'push' && !!record.parentPathId &&
      recordsRef.current.some(item => item.pathId === record.parentPathId);
    const previousSnapshot = captureSnapshot();
    lastSelectionRef.current = null;
    setConnecting(null);
    if (!preserve) setNotesFrameId(null);
    if (seedSubmitting.current && seedOpenRef.current && record.pathId !== seedOrigin.current) {
      seedSubmitting.current = false;
      setSeedBusy(false);
      if (submittedDraft.current?.version === draftVersionRef.current) changeDraft('');
      submittedDraft.current = null;
      seedOpenRef.current = false;
      setSeedOpen(false);
    }
    const nextChain = record.chain as BrowserFlowBatch;
    recordRef.current = record;
    snapshotRef.current = preserve ? previousSnapshot : record.snapshot;
    sourceOpenRef.current = snapshotRef.current.sourceOpen;
    readingScrollRef.current = snapshotRef.current.readingPositions.reader || 0;
    recordsRef.current = nextRecords;
    entriesRef.current = nextEntries;
    const wantedId = preserve ? frameRef.current?.id : record.snapshot.activeFrameId || snapshotFrame(record)?.id;
    const wantedKey = preserve && activeEntryRef.current ? entryKey(activeEntryRef.current) : record.snapshot.activeEntryKey;
    activeEntryRef.current = nextEntries.find(entry => entryKey(entry) === wantedKey) || nextEntries.find(entry => entry.frame.id === wantedId) || nextEntries[0] || null;
    frameRef.current = activeEntryRef.current?.frame || null;
    setChain(nextChain);
    setRecords(nextRecords);
    setActive(frameRef.current);
    pauseReading(reducedRef.current || snapshotRef.current.paused);
    setSourceOpen(sourceOpenRef.current);
    if (!preserve) setRestorePosition(value => ({ revision: value.revision + 1, top: readingScrollRef.current,
      ...(context.navigation === 'source' ? { source: true } : {}),
      ...(wantedId ? { frameId: wantedId } : {}), ...(wantedKey ? { entryKey: wantedKey } : {}) }));
  }

  useEffect(() => {
    if (seedOpen || libraryOpen || keepsakeSource) controllerRef.current?.cancelPreparation();
    // The single stream prepares one continuation as the reader approaches its end.
    // A pause alone is not an instruction to spend calls on another direction.
  }, [seedOpen, libraryOpen, keepsakeSource]);

  useEffect(() => {
    let alive = true;
    void readingStorage.hintSeen().then(seen => { if (alive) setHint(!seen); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const version = bookmarkVersion.current;
    void readingStorage.listBookmarks().then(value => {
      if (alive && bookmarkVersion.current === version) setBookmarkKeys(new Set(value.map(item => item.key)));
    });
    return () => { alive = false; };
  }, [entries]);

  useEffect(() => {
    if (!sourceOpen || !active) return;
    // Full-source typography is optional work after the reader asks for it.
    // A system serif remains readable if a supplementary face is unavailable.
    void prepareFlowFonts([{ quote: active.quote, fullText: active.fullText }]).catch(() => {});
  }, [sourceOpen, active]);

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
        pauseReading();
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
      preparation(quote, progress) { if (alive) { setPreparingQuote(quote); setFontProgress(progress); } },
      initialSnapshot: (_chain, context) => initialSnapshot(reducedRef.current || seedOpenRef.current || !!context.parentSnapshot?.paused),
      async present(record, context) { if (alive) await present(record, { ...context, current: () => alive && context.current() }); },
      update(record) {
        if (!alive) return;
        recordRef.current = record;
        const nextRecords = recordsRef.current.map(item => item.pathId === record.pathId ? record : item);
        recordsRef.current = nextRecords;
        entriesRef.current = streamEntries(nextRecords);
        setChain(record.chain); setRecords(nextRecords);
        const currentKey = activeEntryRef.current && entryKey(activeEntryRef.current);
        activeEntryRef.current = entriesRef.current.find(entry => entryKey(entry) === currentKey) || entriesRef.current.find(entry => entry.frame.id === frameRef.current?.id) || entriesRef.current[0] || null;
        frameRef.current = activeEntryRef.current?.frame || null;
        setActive(frameRef.current);
      },
      background(record) {
        if (!alive || !recordsRef.current.some(item => item.pathId === record.pathId)) return;
        const currentKey = activeEntryRef.current && entryKey(activeEntryRef.current);
        const nextRecords = recordsRef.current.map(item => item.pathId === record.pathId ? record : item);
        recordsRef.current = nextRecords;
        entriesRef.current = streamEntries(nextRecords);
        activeEntryRef.current = entriesRef.current.find(entry => entryKey(entry) === currentKey) || activeEntryRef.current;
        frameRef.current = activeEntryRef.current?.frame || null;
        setRecords(nextRecords); setActive(frameRef.current);
      },
      state(state) {
        if (!alive) return;
        setBusy(state.busy); setPending(state.pending); setFlowError(state.error);
        setLoading(!state.record && (state.pending || state.busy));
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
    const entry = activeEntryRef.current;
    if (!entry || !active) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    listNotes(entry.chainId, active.id).then(value => { if (!cancelled) setNotes(value); });
    return () => { cancelled = true; };
  }, [chain, active]);

  async function handleBranch(selection: Selection) {
    const controller = controllerRef.current;
    if (!controller) return;
    const selectedEntry = entriesRef.current.find(item => item.frame.id === selection.frameId && (!selection.pathId || selection.pathId === item.pathId));
    if (selectedEntry) handleReadEntry(selectedEntry);
    pauseReading();
    lastSelectionRef.current = selection;
    setConnecting(selection);
    await controller.branch(selection);
    if (lastSelectionRef.current === selection && !controller.getState().pending) setConnecting(null);
  }

  function handleReadEntry(entry: StreamEntry) {
    if (entryKey(entry) === (activeEntryRef.current && entryKey(activeEntryRef.current))) return;
    activeEntryRef.current = entry;
    frameRef.current = entry.frame;
    setActive(entry.frame);
    setNotes([]);
    sourceOpenRef.current = false;
    setSourceOpen(false);
  }

  function continueReading() {
    lastSelectionRef.current = null;
    setConnecting(null);
    void controllerRef.current?.next();
  }

  function onToggleSource() {
    const next = !sourceOpenRef.current;
    sourceOpenRef.current = next;
    setSourceOpen(next);
    snapshotRef.current = { ...snapshotRef.current, sourceOpen: next };
  }

  async function startThought() {
    const controller = controllerRef.current;
    if (!controller || seedBusy || (seedTarget.current && !seed.trim())) return;
    const request = ++seedRequestRef.current;
    setSeedError('');
    lastSelectionRef.current = null;
    seedSubmitting.current = true;
    submittedDraft.current = { version: draftVersionRef.current, value: seed };
    setSeedBusy(true);
    if (seedTarget.current) await controller.think(seed, seedTarget.current);
    else await controller.open(seed);
    if (request !== seedRequestRef.current) return;
    seedSubmitting.current = false;
    setSeedBusy(false);
    const error = controller.getState().error;
    if (error && seedOpenRef.current) setSeedError(error.message);
    else { seedOpenRef.current = false; setSeedOpen(false); }
  }

  function openSeed() {
    seedRequestRef.current++;
    seedPause.current = pausedRef.current;
    seedOpenRef.current = true;
    seedOrigin.current = recordRef.current?.pathId || null;
    seedTarget.current = activeEntryRef.current ? { pathId: activeEntryRef.current.pathId, frameId: activeEntryRef.current.frame.id } : null;
    pauseReading();
    setSeedError(''); setSeedOpen(true);
  }
  function cancelSeed() {
    seedRequestRef.current++;
    if (seedSubmitting.current) controllerRef.current?.cancel();
    seedSubmitting.current = false;
    setSeedBusy(false);
  }
  function closeSeed() {
    seedRequestRef.current++;
    const submitted = seedSubmitting.current;
    if (submitted) controllerRef.current?.cancel();
    seedSubmitting.current = false;
    setSeedBusy(false);
    seedOpenRef.current = false;
    if (!submitted || (recordRef.current?.pathId || null) === seedOrigin.current) {
      const next = seedPause.current || reducedRef.current;
      pauseReading(next);
    }
    setSeedOpen(false);
  }

  function changeDraft(value: string) {
    draftVersionRef.current++;
    setSeed(value);
    void saveDraft(value).then(result => { if (!result.persisted) setStorageWarning(true); });
  }

  async function onSaveNote(text: string) {
    const entry = activeEntryRef.current;
    if (!entry) return;
    const { chainId, pathId, frame } = entry;
    setSavingNote(true);
    const now = Date.now();
    const previous = savingNoteId.current;
    const id = previous?.chainId === chainId && previous.frameId === frame.id ? previous.id : createPathId();
    const createdAt = previous?.id === id ? previous.createdAt : now;
    savingNoteId.current = { id, chainId, frameId: frame.id, createdAt };
    try {
      const result = await saveNote({ id, chainId, frameId: frame.id, text, createdAt, updatedAt: now, context: noteContext(frame), pathId });
      await refreshNotes(chainId, frame.id);
      if (!result.persisted) { setStorageWarning(true); throw new Error('注脚仅本次可用，请重试保存或导出。'); }
      savingNoteId.current = null;
    } finally { setSavingNote(false); }
  }

  async function onUpdateNote(id: string, text: string) {
    const result = await readingStorage.updateNote(id, text);
    if (activeEntryRef.current) await refreshNotes(activeEntryRef.current.chainId, activeEntryRef.current.frame.id);
    if (!result.persisted) { setStorageWarning(true); throw new Error('修改仅本次可用，请重试保存或导出。'); }
  }

  function openLibrary() {
    libraryPause.current = paused; libraryRestored.current = false;
    controllerRef.current?.cancel();
    pauseReading();
    void controllerRef.current?.checkpoint();
    setLibraryOpen(true);
  }
  async function openKeepsake(source: KeepsakeSource) {
    const version = ++keepsakeOpening.current;
    keepsakePause.current = libraryOpen ? libraryPause.current : pausedRef.current;
    controllerRef.current?.cancelPreparation();
    void controllerRef.current?.checkpoint();
    pauseReading();
    if (source.sourceRef.noteId && source.noteText !== undefined && /^\d+$/.test(source.sourceRef.noteRevision || '')) {
      const { noteRevision } = await import('@/lib/handwriting/reading-draft');
      const revision = await noteRevision({ updatedAt: Number(source.sourceRef.noteRevision), text: source.noteText });
      if (version !== keepsakeOpening.current) return;
      source = { ...source, sourceRef: { ...source.sourceRef, noteRevision: revision } };
    }
    setLibraryOpen(false);
    setKeepsakeSource(source);
  }
  function currentKeepsake(note?: PersonalNote) {
    const entry = activeEntryRef.current;
    if (!entry) return;
    const context = note?.context || noteContext(entry.frame);
    openKeepsake({ sourceRef: { pathId: note?.pathId || entry.pathId, frameId: note?.frameId || entry.frame.id,
      ...(note ? { noteId: note.id, noteRevision: String(note.updatedAt) } : {}) },
      quote: context.quote, sourceLabel: context.source, chapterLabel: context.chapterLabel,
      ...(note ? { noteText: note.text, date: note.createdAt } : {}) });
  }
  function closeKeepsake() {
    keepsakeOpening.current++;
    setKeepsakeSource(null);
    pauseReading(keepsakePause.current || reducedRef.current);
  }
  function closeLibrary() {
    if (!libraryRestored.current) {
      controllerRef.current?.cancel();
      const next = libraryPause.current || reducedRef.current;
      pauseReading(next);
    }
    setLibraryOpen(false);
  }
  async function openSaved(target: SavedTarget) {
    const restored = await controllerRef.current?.openSaved(target) || false;
    if (restored) {
      libraryRestored.current = true;
      setNotesFrameId(target.notes ? frameRef.current?.id || null : null);
    }
    return restored;
  }
  async function toggleBookmark() {
    const frame = frameRef.current, record = recordsRef.current.find(item => item.pathId === activeEntryRef.current?.pathId);
    if (!frame || !record || savingBookmark.current) return;
    const snapshot = captureSnapshot();
    savingBookmark.current = true;
    bookmarkVersion.current++;
    try {
      const key = quoteKey(frame), previous = await readingStorage.getBookmark(key);
      const result = previous ? await readingStorage.deleteBookmark(key) : await readingStorage.saveBookmark({ kind: 'bookmark', key, pathId: record.pathId, chainId: record.chain.chainId, frameId: frame.id, ...noteContext(frame), snapshot, createdAt: Date.now(), updatedAt: Date.now() });
      setBookmarkKeys(keys => {
        const next = new Set(keys);
        if (previous) next.delete(key);
        else next.add(key);
        return next;
      });
      if (!result.persisted) setStorageWarning(true);
    } finally { savingBookmark.current = false; }
  }

  async function onDeleteNote(id: string) {
    const result = await deleteNote(id);
    if (result.deleted && result.previous) undoNoteRef.current = result.previous;
    if (!result.persisted) setStorageWarning(true);
    if (activeEntryRef.current) await refreshNotes(activeEntryRef.current.chainId, activeEntryRef.current.frame.id);
  }

  async function onUndoNote() {
    const note = undoNoteRef.current;
    if (!note) return;
    const result = await restoreNote(note);
    if (!result.persisted) setStorageWarning(true);
    undoNoteRef.current = null;
    if (activeEntryRef.current) await refreshNotes(activeEntryRef.current.chainId, activeEntryRef.current.frame.id);
  }

  async function refreshNotes(chainId: string, frameId: string) {
    const value = await listNotes(chainId, frameId);
    if (activeEntryRef.current?.chainId === chainId && frameRef.current?.id === frameId) setNotes(value);
  }

  const currentFrame = active || frames[0] || null;
  const awaitingQuote = busy || !frames.some(item => item.ready === false);
  const canResume = flowError?.code === 'INCOMPLETE' && !pending &&
    controllerRef.current?.getState().record?.completion === 'stopped';
  const errorFeedback = flowError && !canResume ? <div className={styles.streamError} role="status">
    <p>{flowError.message}</p>
    {flowError.code !== 'BUDGET_REACHED' && (['CHAIN_EXPIRED', 'CORPUS_CHANGED', 'CONNECTION_REQUIRED'].includes(flowError.code)
      ? <button className={styles.textButton} type="button" onClick={() => {
        const selected = lastSelectionRef.current;
        if (selected?.pathId && selected.pathId !== recordRef.current?.pathId) void controllerRef.current?.branch(selected);
        else void controllerRef.current?.restart(selected || (currentFrame ? { frameId: currentFrame.id } : undefined));
      }}>{lastSelectionRef.current?.selection ? '沿此词重新展开' : '从原句重新展开'}</button>
      : <button className={styles.textButton} type="button" onClick={() => void controllerRef.current?.retry()}>重试</button>)}
    <button className={styles.textButton} type="button" onClick={() => controllerRef.current?.dismissError()}>{flowError.code === 'BUDGET_REACHED' ? '回到已读经文' : '留在原句'}</button>
  </div> : undefined;
  return (
    <main ref={experienceRef} className={styles.experience}>
      <div className={styles.experienceContent}>
      <div className={styles.topBar}>
        <h1 className={styles.brand}>六经注我</h1>
      </div>
      <FlowStream entries={entries} activeKey={activeEntryRef.current ? entryKey(activeEntryRef.current) : ''}
        navigation={{ onThought: openSeed, onLibrary: openLibrary, libraryDisabled: !chain || loading,
          motionCandidate: motion.available ? { enabled: motion.variant === 'liquid-live', onToggle: motion.toggle } : undefined }}
        motionVariant={motion.variant}
        paused={paused || seedOpen || libraryOpen || !!keepsakeSource} reducedMotion={reducedMotion} pending={pending}
        connecting={connecting} restore={restorePosition}
        canContinue={!!chain?.cursor && !chain.exhausted && !flowError && frames.every(item => item.ready !== false)}
        onContinue={continueReading} onPrepareNext={() => controllerRef.current?.prepareNext()}
        onPause={() => pauseReading()} onResume={() => { if (!seedOpen && !libraryOpen && !reducedMotion) pauseReading(false); }}
        onRead={handleReadEntry} onVisualReady={() => setFirstVisualReady(true)}
        onScroll={top => { readingScrollRef.current = top; }} onBranch={selection => void handleBranch(selection)}
        waiting={!seedOpen && (pending ? <FlowWaiting compact busy={awaitingQuote} label={connecting?.label} onCancel={() => controllerRef.current?.cancel()} />
          : canResume ? <FlowResume onResume={() => void controllerRef.current?.retry()} /> : errorFeedback)}
        sourceOpen={sourceOpen} onToggleSource={onToggleSource} bookmarkKeys={bookmarkKeys} onBookmark={() => void toggleBookmark()}
        notesFrameId={notesFrameId} notes={notes} savingNote={savingNote}
        onSaveNote={onSaveNote} onDeleteNote={onDeleteNote} onUndoNote={onUndoNote} onUpdateNote={onUpdateNote} onKeepsake={currentKeepsake} />

      <FlowLoading active={!firstVisualReady && !flowError} progress={fontProgress} quote={currentFrame?.quote || preparingQuote} reducedMotion={reducedMotion} />
      {hint && !loading && !pending && <div className={styles.firstHint}><span>点一下停驻，点词接续；上下滑动继续，长按释义，左滑菜单。</span><button type="button" className={styles.textButton} onClick={() => { setHint(false); void readingStorage.dismissHint(); }}>知道了</button></div>}
      {!entries.length && errorFeedback && <div className={styles.notice}>{errorFeedback}</div>}
      {storageWarning && <p className={styles.storageNotice} role="status">本机存储暂不可用；当前阅读仍可继续，刷新后可能无法恢复。</p>}

      <span className={styles.srOnly} aria-live="polite">{currentFrame ? `${currentFrame.source}，${currentFrame.chapterLabel}。${currentFrame.quote}` : ''}</span>
      </div>
      <SeedSheet open={seedOpen} value={seed} busy={seedBusy} continuing={!!seedTarget.current} error={seedError} onChange={changeDraft} onSubmit={() => void startThought()} onClose={closeSeed} onCancel={cancelSeed} />
      {keepsakeSource && <ReadingKeepsakeSheet source={keepsakeSource} onClose={closeKeepsake} />}
      {libraryOpen && <LibrarySheet onClose={closeLibrary} onOpen={openSaved} onKeepsake={openKeepsake}
        context={activeEntryRef.current ? { pathId: activeEntryRef.current.pathId, frameId: activeEntryRef.current.frame.id } : undefined} onChanged={() => {
        if (activeEntryRef.current) void refreshNotes(activeEntryRef.current.chainId, activeEntryRef.current.frame.id);
        const version = ++bookmarkVersion.current;
        void readingStorage.listBookmarks().then(value => {
          if (version === bookmarkVersion.current) setBookmarkKeys(new Set(value.map(item => item.key)));
        });
      }} />}
    </main>
  );
}
