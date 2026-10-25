'use client';
import { useEffect, useRef, useState } from 'react';
import { downloadNotes, loadLibrary, snapshotFrame, type SavedTarget } from '@/lib/flow-browser/library';
import { readingStorage } from '@/lib/flow-browser/storage';
import { EditableNote } from './EditableNote';
import { useFlowDialog } from './useFlowDialog';
import { KnowledgeLibrary } from './KnowledgeLibrary';
import type { KeepsakeSource } from '@/lib/handwriting/contracts';
import styles from './flow.module.css';

type Data = Awaited<ReturnType<typeof loadLibrary>>;
const tabs = ['最近阅读', '关联', '收藏', '注脚'] as const;
export function LibrarySheet({ onClose, onOpen, onChanged, onKeepsake, context }: { onClose: () => void; onOpen: (target: SavedTarget) => Promise<boolean>; onChanged: () => void; onKeepsake?: ((source: KeepsakeSource) => void) | undefined; context?: SavedTarget | undefined }) {
  const ref = useFlowDialog(onClose);
  // Background reflow may change the reader's active passage while this dialog
  // is open. Keep the opening context so browsing a theme is not interrupted.
  const [readingContext] = useState(context);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>('最近阅读');
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void loadLibrary().then(value => { if (alive.current) setData(value); }); return () => { alive.current = false; }; }, []);
  async function open(target: SavedTarget) {
    if (opening) return;
    setOpening(true); setError('');
    try { if (await onOpen(target)) onClose(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '暂时无法打开，请重试。'); }
    finally { if (alive.current) setOpening(false); }
  }
  async function update(id: string, text: string) {
    const result = await readingStorage.updateNote(id, text);
    const value = await loadLibrary();
    if (alive.current) setData(value);
    onChanged();
    if (!result.persisted) throw new Error('修改仅本次可用，请重试保存或导出。');
  }
  const items = !data ? [] : tab === '最近阅读' ? data.paths : tab === '收藏' ? data.bookmarks : data.notes;
  function selectTab(index: number, focus = false) {
    setTab(tabs[index]!); setLimit(20); setError('');
    if (listRef.current) listRef.current.scrollTop = 0;
    if (focus) tabRefs.current[index]?.focus();
  }
  return <div className={styles.sheetBackdrop} role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className={`${styles.seedSheet} ${styles.librarySheet}`} role="dialog" aria-modal="true" aria-labelledby="flow-library-title">
      <header className={styles.libraryHeader}><h2 id="flow-library-title">温故</h2><button type="button" className={styles.textButton} onClick={onClose}>返回阅读</button></header>
      <div className={styles.libraryTabs} role="tablist" aria-label="温故分类">
        {tabs.map((name, index) => <button key={name} ref={element => { tabRefs.current[index] = element; }} id={`flow-library-tab-${index}`} type="button" role="tab" aria-selected={tab === name} aria-controls="flow-library-panel" tabIndex={tab === name ? 0 : -1} className={styles.textButton} onClick={() => selectTab(index)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); selectTab(next, true); }
        }}>{name}</button>)}
      </div>
      <p className={styles.muted}>只保存在这台设备。</p>
      {error && <p className={styles.seedError} role="status">{error}</p>}
      <div ref={listRef} id="flow-library-panel" role="tabpanel" tabIndex={0} aria-labelledby={`flow-library-tab-${tabs.indexOf(tab)}`} className={styles.libraryList} aria-busy={opening || !data}>
        {tab !== '关联' && (!data ? <p className={styles.muted} role="status">正在取回…</p> : items.length === 0 ? <p className={styles.libraryEmpty}>{tab === '最近阅读' ? '读过的经文会留在这里。' : tab === '收藏' ? '停驻阅读时，可以收藏经句。' : '留下自己的理解，下次再读。'}</p> : null)}
        {tab === '关联' && <KnowledgeLibrary context={readingContext} opening={opening} onOpen={open} />}
        {tab === '最近阅读' && data?.paths.slice(0, limit).map(path => {
          const frame = snapshotFrame(path);
          return <article key={path.pathId} className={styles.libraryRow}><button type="button" className={styles.libraryOpen} disabled={opening} onClick={() => void open({ pathId: path.pathId })}>
            <span className={styles.libraryQuote}>{frame?.quote || path.sourceLabel}</span><span className={styles.muted}>{frame?.source} · {frame?.chapterLabel} · {new Date(path.updatedAt).toLocaleDateString('zh-CN')}</span>
          </button>{frame && onKeepsake && <button type="button" className={styles.textButton} onClick={() => onKeepsake({ sourceRef: { pathId: path.pathId, frameId: frame.id }, quote: frame.quote, sourceLabel: frame.source, chapterLabel: frame.chapterLabel, date: path.updatedAt })}>留成手写纪念卡</button>}</article>;
        })}
        {tab === '收藏' && data?.bookmarks.slice(0, limit).map(item => <article key={item.key} className={styles.libraryRow}><button type="button" className={styles.libraryOpen} disabled={opening} onClick={() => void open({ pathId: item.pathId, frameId: item.frameId, snapshot: item.snapshot })}>
          <span className={styles.libraryQuote}>{item.quote}</span><span className={styles.muted}>{item.source} · {item.chapterLabel}</span>
        </button>{onKeepsake && <button type="button" className={styles.textButton} onClick={() => onKeepsake({ sourceRef: { pathId: item.pathId, frameId: item.frameId }, quote: item.quote, sourceLabel: item.source, chapterLabel: item.chapterLabel, date: item.createdAt })}>留成手写纪念卡</button>}</article>)}
        {tab === '注脚' && data?.notes.slice(0, limit).map(note => <article key={note.id} className={styles.libraryNote}>
          <p className={styles.muted}>{note.context ? `${note.context.source} · ${note.context.chapterLabel}` : '原阅读记录不可用'}</p>
          {note.context && <p className={styles.libraryQuote}>{note.context.quote}</p>}
          <EditableNote note={note} onUpdate={update} />
          {note.context && onKeepsake && <button type="button" className={styles.textButton} disabled={opening} onClick={() => onKeepsake({ sourceRef: { ...(note.pathId ? { pathId: note.pathId } : {}), frameId: note.frameId, noteId: note.id, noteRevision: String(note.updatedAt) }, quote: note.context!.quote, sourceLabel: note.context!.source, chapterLabel: note.context!.chapterLabel, noteText: note.text, date: note.createdAt })}>留成手写纪念卡</button>}
          {note.target ? <button type="button" className={styles.textButton} disabled={opening} onClick={() => void open(note.target!)}>回到经句</button> : <p className={styles.muted}>原阅读记录不可用，注脚仍可编辑和导出。</p>}
        </article>)}
      {tab !== '关联' && items.length > limit && <button type="button" className={styles.textButton} onClick={() => setLimit(value => value + 20)}>再看一些</button>}
      </div>
      {tab === '注脚' && !!data?.notes.length && <button type="button" className={styles.textButton} onClick={() => { try { downloadNotes(data.notes); } catch { setError('导出未成功，请重试。'); } }}>导出全部注脚</button>}
    </section>
  </div>;
}
