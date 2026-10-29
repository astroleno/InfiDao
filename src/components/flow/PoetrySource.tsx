'use client';
import { useEffect, useState } from 'react';
import type { FlowFrame, FlowSelection } from '@/lib/flow/contracts';
import type { PoetryWork } from '@/lib/content/contracts';
import { LinkedText } from './LinkedText';
import styles from './flow.module.css';
import { selectedSourceFrame } from '@/lib/content/references';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';

type Props = { frame: FlowFrame; onSelect: (frame: FlowFrame, selection: FlowSelection, label: string) => void };
type WorkDetail = Omit<PoetryWork, 'passages'> & { passages: Array<PoetryWork['passages'][number] & { lexicalBreaks?: number[] }> };
const cacheName = 'infidao-poetry-works-v1';
async function cachedWork(url: string, signal: AbortSignal) {
  let cache: Cache | undefined;
  try { cache = await globalThis.caches?.open(cacheName); } catch { /* Current reading remains usable without persistence. */ }
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Work unavailable');
    if (cache) {
      await cache.put(url, response.clone()).catch(() => {});
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - 32))) await cache.delete(old);
    }
    return response.json();
  } catch (error) {
    signal.throwIfAborted();
    const saved = await cache?.match(url);
    if (saved) return saved.json();
    throw error;
  }
}
export function PoetrySource({ frame, onSelect }: Props) {
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ref = frame.work!;
  useEffect(() => {
    const controller = new AbortController();
    setWork(null); setError(false);
    const url = `/api/flow/works/${ref.workId}?revision=${ref.revision}`;
    void cachedWork(url, controller.signal).then(body => {
      if (body?.data?.id !== ref.workId || body.data.revision !== ref.revision || typeof body.data.text !== 'string' || !Array.isArray(body.data.passages)) throw new Error('Source identity differs');
      if (!controller.signal.aborted) setWork(body.data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [ref.workId, ref.revision, attempt]);
  useEffect(() => { if(work) void prepareFlowFonts([{quote:frame.quote,fullText:work.text}]).catch(()=>{}); },[work,frame.quote]);
  return <div data-poetry-source>
    <p className={styles.sectionLabel}>{ref.title} · {ref.dynasty} · {ref.author}{work ? (/^(句|残句|佚句)(?:\s|$)/u.test(ref.title) ? ' · 传世片段' : ' · 作品全文') : ' · 已读片段'}</p>
    {!work && <>
      <p role="status" className={styles.muted}>{error ? '整首暂不可用，已读片段仍可阅读。' : '正在读取整首…'}</p>
      <p className={styles.fullSource} style={{ whiteSpace: 'pre-wrap' }}>{frame.fullText}</p>
      {error && <button type="button" className={styles.textButton} onClick={() => setAttempt(value => value + 1)}>重试读取整首</button>}
    </>}
    {work && <div className={styles.fullSource} style={{ whiteSpace: 'pre-wrap' }}>{work.passages.map(passage => {
      const text = work.text.slice(passage.start, passage.end);
      const current = passage.id === frame.sourceId;
      const source: FlowFrame = { ...frame, sourceId: passage.id, fullText: text, textHash: passage.textHash,
        corpusVersion: `poetry:${work.revision}`, quote: current ? frame.quote : '', quoteStart: current ? frame.quoteStart : 0,
        quoteEnd: current ? frame.quoteEnd : 0, lexicalBreaks: passage.lexicalBreaks || [], anchors: [],
        work: { ...ref, start: passage.start, end: passage.end } };
      return <span key={passage.id}><LinkedText frame={source} surface="fullText" onSelect={chosen => {
        if (!chosen.selection) return;
        try { onSelect(selectedSourceFrame(source,chosen.selection),chosen.selection,chosen.label); }
        catch { setError(true); }
      }} /></span>;
    })}</div>}
    <p className={styles.streamProvenance}>原文与作者信息来自诗词资料库；释义与回响由 AI 生成，供参照。</p>
    {work?.sourceUrl?.startsWith('https://github.com/palemoky/chinese-poetry/blob/') && <a className={styles.textButton} href={work.sourceUrl} target="_blank" rel="noopener noreferrer">查看资料来源</a>}
  </div>;
}
