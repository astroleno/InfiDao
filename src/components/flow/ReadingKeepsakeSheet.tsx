'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { MAX_TEXT_LENGTH, LAYOUTS, STATUS_LABEL, isPending, type CachedKeepsake, type ContentPart, type HandwritingCapabilities, type KeepsakeSource, type ReadingKeepsakeDraft } from '@/lib/handwriting/contracts';
import { createReadingDraft, generationContent, contentDigest } from '@/lib/handwriting/reading-draft';
import { cacheKey, clearKeepsakeCache, flushInvalidatedKeepsakes, getKeepsakeCache, listKeepsakeCache, readKeepsakeCache, saveKeepsakeCache } from '@/lib/handwriting/cache';
import { cancelKeepsake, getKeepsake, handwritingCapabilities, retryKeepsake, submitKeepsake } from '@/lib/handwriting/client';
import { useFlowDialog } from './useFlowDialog';
import styles from './flow.module.css';
import card from './keepsake.module.css';

const labels: Record<ContentPart, string> = { quote: '经句', source: '来源与章节', note: '所选注脚', date: '日期', signature: '落款' };
const parts: ContentPart[] = ['quote', 'source', 'note', 'date', 'signature'];
const message = (error: unknown) => error instanceof Error ? error.message : '暂时无法完成，草稿仍在本机。';

export function ReadingKeepsakeSheet({ source, onClose }: { source: KeepsakeSource; onClose: () => void }) {
  const [draft, setDraft] = useState(() => createReadingDraft(source));
  const [settings, setSettings] = useState<HandwritingCapabilities | null>(null);
  const [record, setRecord] = useState<CachedKeepsake | null>(null);
  const [history, setHistory] = useState<CachedKeepsake[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [styleSearch, setStyleSearch] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const latestDraft = useRef(draft), edits = useRef(0), refreshing = useRef(0);
  latestDraft.current = draft;
  const alive = useRef(true), epoch = useRef(0), working = useRef(false);
  const writing = useRef(0);
  const active = useRef<CachedKeepsake | null>(null);
  const composition = useRef<AbortController | null>(null);
  const panel = useFlowDialog(close);
  const content = generationContent(draft);
  const pending = record?.job && isPending(record.job.status);
  const jobId = record?.job?.id, jobStatus = record?.job?.status, jobDigest = record?.job?.contentDigest;
  const invalidated = record?.invalidated;
  const locked = !!pending || busy || composing || !!record?.invalidated;

  async function persist(next: CachedKeepsake, optimistic = false) {
    const version = ++writing.current;
    if (optimistic) { active.current = next; if (alive.current) setRecord(next); }
    await saveKeepsakeCache(next);
    if (version !== writing.current) return;
    active.current = next;
    if (alive.current) setRecord(next);
    const items = await listKeepsakeCache(next.scope);
    if (alive.current && version === writing.current) setHistory(items);
  }
  async function refresh() {
    const sequence = ++refreshing.current, version = edits.current;
    setError('');
    try {
      const caps = await handwritingCapabilities();
      if (!alive.current || sequence !== refreshing.current) return;
      setSettings(caps);
      await flushInvalidatedKeepsakes();
      const cached = await readKeepsakeCache(caps.ownerScope, source);
      if (!alive.current || sequence !== refreshing.current) return;
      const recovered = version === edits.current ? cached : null;
      const currentDraft = recovered?.draft || { ...latestDraft.current, styleCode: latestDraft.current.styleCode || caps.styles[0]?.id || '' };
      const next = recovered || { key: cacheKey(caps.ownerScope, currentDraft), scope: caps.ownerScope, draft: currentDraft, request: null, job: null, pages: [], pdf: null, updatedAt: Date.now() };
      setDraft(currentDraft); await persist(next);
      if (alive.current) setHistory(await listKeepsakeCache(caps.ownerScope));
    } catch (reason) { if (alive.current && sequence === refreshing.current) setError(message(reason)); }
  }

  useEffect(() => {
    const lifecycle = epoch, compositor = composition, refreshes = refreshing;
    alive.current = true;
    void refresh();
    const invalidate = (event: Event) => {
      const target = (event as CustomEvent<{ noteId?: string; pathId?: string; scope?: string }>).detail;
      const ref = active.current?.draft.sourceRef;
      if (active.current) void listKeepsakeCache(active.current.scope).then(items => { if (alive.current) setHistory(items); });
      if (!ref || !((target.scope && target.scope === active.current?.scope) || (target.noteId && target.noteId === ref.noteId) || (target.pathId && target.pathId === ref.pathId))) return;
      epoch.current++; composition.current?.abort();
      writing.current++;
      active.current = { ...active.current!, invalidated: true, pages: [], pdf: null };
      setRecord(active.current); setError('来源已修改或删除，请回到原文重新建立草稿。');
    };
    window.addEventListener('infidao-keepsakes-invalidated', invalidate);
    return () => { alive.current = false; lifecycle.current++; refreshes.current++; compositor.current?.abort(); window.removeEventListener('infidao-keepsakes-invalidated', invalidate); };
    // Opening captures this exact source; a later reading frame must not replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jobId || !jobStatus || !isPending(jobStatus) || invalidated) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const id = jobId, digest = jobDigest;
    const poll = async () => {
      try {
        const job = await getKeepsake(id, controller.signal);
        const current = active.current;
        if (stopped || !alive.current || current?.job?.id !== id || current.invalidated || job.contentDigest !== digest) return;
        await persist({ ...current, job, updatedAt: Date.now() });
      } catch (reason) { if (!stopped && alive.current) setError(message(reason)); }
      if (!stopped) timer = setTimeout(() => void poll(), document.hidden ? 15_000 : 3000);
    };
    timer = setTimeout(() => void poll(), 800);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [jobId, jobStatus, jobDigest, invalidated]);

  useEffect(() => {
    const next = record?.pages.map(blob => URL.createObjectURL(blob)) || [];
    setUrls(next);
    return () => { next.forEach(url => URL.revokeObjectURL(url)); };
  }, [record?.pages]);

  function change(next: ReadingKeepsakeDraft) {
    if (locked) return;
    edits.current++;
    epoch.current++; setConsent(false); setError('');
    // Preserve the old snapshot and its result under its own key.
    if (record?.request) next = { ...next, draftId: crypto.randomUUID(), createdAt: Date.now() };
    next = { ...next, contentDigest: '' };
    setDraft(next);
    if (record) void persist({ ...record, key: cacheKey(record.scope, next), draft: next, request: null, job: null, pages: [], pdf: null, updatedAt: Date.now() }, true).catch(reason => setError(message(reason)));
  }
  async function make() {
    if (working.current || !settings?.configured || !record || record.invalidated || !consent) return;
    working.current = true; setBusy(true); setError('');
    const version = ++epoch.current;
    try {
      const exact = generationContent(draft);
      if (!exact.text.trim() || exact.text.length > MAX_TEXT_LENGTH) throw new Error('请选择 1 至 20000 字的内容。');
      const digest = await contentDigest(settings.ownerScope, exact);
      const local = (await listKeepsakeCache(settings.ownerScope)).find(item => item.request?.contentDigest === digest && item.job?.status === 'ready' && item.pdf && item.pages.length === item.job.pages.length);
      if (local && alive.current && version === epoch.current) {
        await persist({ ...record, draft: { ...draft, contentDigest: digest }, request: local.request, job: local.job,
          pages: local.pages, pdf: local.pdf, updatedAt: Date.now() });
        return;
      }
      if (record.job?.retryPreparation && record.request?.contentDigest === digest) {
        const job = await retryKeepsake(record.job.id);
        if (alive.current && version === epoch.current) await persist({ ...record, job, updatedAt: Date.now() });
        return;
      }
      const request = record.request && record.request.contentDigest === digest && (!record.job || isPending(record.job.status))
        ? record.request : { requestId: crypto.randomUUID(), contentDigest: digest, content: exact, consent: true as const };
      const next = { ...record, draft: { ...draft, contentDigest: digest }, request, job: null, pages: [], pdf: null, updatedAt: Date.now() };
      // Persist the idempotency key before the first possible network write.
      await persist(next);
      const job = await submitKeepsake(request);
      if (!alive.current || version !== epoch.current || active.current?.invalidated) return;
      if (job.contentDigest !== digest) throw new Error('任务与草稿不一致，请重新打开这份草稿。');
      await persist({ ...next, job, updatedAt: Date.now() });
    } catch (reason) { if (alive.current) setError(message(reason)); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function cancel() {
    const current = active.current;
    if (!current?.job || working.current) return;
    epoch.current++; composition.current?.abort(); working.current = true; setBusy(true);
    try { const job = await cancelKeepsake(current.job.id); if (alive.current) await persist({ ...current, job, pages: [], pdf: null, updatedAt: Date.now() }); }
    catch (reason) { if (alive.current) setError(message(reason)); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function compose() {
    const current = active.current;
    if (!current?.job || current.job.status !== 'ready' || current.invalidated || composing) return;
    const version = ++epoch.current;
    const controller = new AbortController(); composition.current = controller;
    setComposing(true); setError('');
    try {
      const { composeReadingCard } = await import('@/lib/handwriting/compose-reading-card');
      const pages = [];
      for (const page of current.job.pages) {
        const response = await fetch(`/api/handwriting/jobs/${current.job.id}/assets/${encodeURIComponent(page.layer)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('素材暂不可取回，请稍后重试。');
        pages.push({ page, image: await response.blob() });
      }
      const result = await composeReadingCard({ pages, layout: current.request!.content.layout }, controller.signal);
      if (!alive.current || version !== epoch.current || active.current?.invalidated) return;
      await persist({ ...current, pages: result.pages, pdf: result.pdf, updatedAt: Date.now() });
    } catch (reason) { if (alive.current && !controller.signal.aborted) setError(message(reason)); }
    finally { if (alive.current) setComposing(false); }
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function clear() {
    if (!settings || working.current) return;
    epoch.current++; composition.current?.abort(); setBusy(true); working.current = true;
    try {
      await clearKeepsakeCache(settings.ownerScope);
      const next = createReadingDraft(source); next.styleCode = settings.styles[0]?.id || '';
      setDraft(next); setConsent(false);
      const fresh = { key: cacheKey(settings.ownerScope, next), scope: settings.ownerScope, draft: next, request: null, job: null, pages: [], pdf: null, updatedAt: Date.now() };
      await persist(fresh); setHistory([]); setError('导出记录已清理；已下载的文件请自行保管。');
    } catch (reason) { setError(message(reason)); }
    finally { working.current = false; setBusy(false); }
  }
  function close() { composition.current?.abort(); onClose(); }
  async function openHistory(key: string) {
    try {
      const saved = await getKeepsakeCache(key);
      if (!saved || saved.scope !== settings?.ownerScope) { setError('这份记录已清理，请从原文重新建立草稿。'); return; }
      epoch.current++; setDraft(saved.draft); active.current = saved; setRecord(saved); setConsent(false); setError('');
    } catch (reason) { setError(message(reason)); }
  }
  const choices = settings?.styles.filter(style => !styleSearch || `${style.id} ${style.label}`.toLowerCase().includes(styleSearch.toLowerCase())).slice(0, 50) || [];
  const selectedStyle = settings?.styles.find(style => style.id === draft.styleCode);
  if (selectedStyle && !choices.some(style => style.id === selectedStyle.id)) choices.unshift(selectedStyle);

  return <div className={styles.sheetBackdrop} role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} className={`${styles.seedSheet} ${card.sheet}`} role="dialog" aria-modal="true" aria-labelledby="keepsake-title">
      <header className={styles.libraryHeader}><h2 id="keepsake-title">手写纪念卡</h2><button type="button" className={styles.textButton} onClick={close}>返回阅读</button></header>
      <p className={styles.muted}>选一句经文，留一点自己的理解。制作期间可以继续阅读。</p>
      <fieldset disabled={locked} className={card.fields}><legend>卡面内容</legend>
        <div className={card.parts}>{parts.map(part => <label key={part}><input type="checkbox" checked={draft.included[part]} disabled={part === 'note' && draft.noteText === undefined} onChange={event => change({ ...draft, included: { ...draft.included, [part]: event.target.checked } })} />{labels[part]}</label>)}</div>
        <blockquote className={card.quote}>{draft.quote}</blockquote>
        <p className={styles.muted}>{draft.sourceLabel} · {draft.chapterLabel} · {draft.dateLabel}</p>
        {draft.noteText !== undefined && <label className={card.label}>所选注脚<textarea aria-label="所选注脚" aria-describedby="keepsake-note-help" value={draft.noteText} maxLength={18_000} onChange={event => change({ ...draft, noteText: event.target.value })} /><span id="keepsake-note-help" className={styles.muted}>这里的修改只用于纪念卡；原注脚保持原样。</span></label>}
        {draft.included.signature && <label className={card.label}>落款<input value={draft.signature} maxLength={80} placeholder="留空也可以" onChange={event => change({ ...draft, signature: event.target.value })} /></label>}
        <div className={card.options}>
          <label className={card.label}>字迹编号筛选<input aria-label="字迹编号筛选" type="search" value={styleSearch} placeholder="按编号查找" onChange={event => setStyleSearch(event.target.value)} /></label>
          <label className={card.label}>手写字迹<select aria-label="手写字迹" value={draft.styleCode} onChange={event => change({ ...draft, styleCode: event.target.value })}><option value="">请选择字迹</option>{choices.map(style => <option key={style.id} value={style.id}>{style.label}{style.default ? ' · 常用' : style.favorite ? ' · 收藏' : ''}</option>)}</select></label>
          <label className={card.label}>纸面<select aria-label="纸面" value={draft.layout} onChange={event => change({ ...draft, layout: event.target.value as ReadingKeepsakeDraft['layout'] })}>{Object.entries(LAYOUTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </fieldset>
      <section className={card.preview} aria-labelledby="keepsake-preview-title"><h3 id="keepsake-preview-title">本次发送的准确文字</h3><pre>{content.text || '尚未选择内容'}</pre><p className={styles.muted}>{content.text.length} / 20000 字 · 长文自动分页，保留完整文字。</p></section>
      {!settings?.configured && <p className={styles.muted} role="status">{settings?.reason || '正在确认手写服务…'}<button type="button" className={styles.textButton} onClick={() => void refresh()}>重新连接</button></p>}
      <label className={card.consent}><input type="checkbox" checked={consent} disabled={locked} onChange={event => setConsent(event.target.checked)} />我确认将上方所选文字发送给 Inko 制作手写纪念卡。</label>
      {record?.job && <section className={card.status} aria-live="polite"><p>{STATUS_LABEL[record.job.status]}{record.job.pagesDone ? ` · ${record.job.pagesDone} 页` : ''}</p>
        {record.job.error && <p className={styles.muted}>{record.job.error.message}</p>}
        {!!record.job.error?.positions?.length && <ul>{record.job.error.positions.map((position, i) => <li key={i}>第 {position.position + 1} 个位置：<mark>{position.symbol}</mark></li>)}</ul>}
        {pending && <button type="button" className={styles.textButton} disabled={busy} onClick={() => void cancel()}>取消制作</button>}
      </section>}
      {error && <p className={styles.seedError} role="status">{error}</p>}
      <div className={card.actions}>
        {!pending && record?.job?.status !== 'ready' && <button type="button" className={styles.quietButton} disabled={locked || !record || !settings?.configured || !consent || !draft.styleCode || !content.text.trim() || content.text.length > MAX_TEXT_LENGTH} onClick={() => void make()}>{busy ? '正在核对原任务…' : record?.job?.retryPreparation ? '继续整理卡面' : record?.request && !record.job ? '核对并继续制作' : '开始制作'}</button>}
        {record?.job?.status === 'ready' && !record.pages.length && <button type="button" className={styles.quietButton} disabled={composing || !!record.invalidated} onClick={() => void compose()}>{composing ? '正在合成高清卡面…' : '预览并准备保存'}</button>}
      </div>
      {urls.map((url, index) => <figure key={url} className={card.result}><Image unoptimized src={url} alt={`手写纪念卡，第 ${index + 1} 页`} width={2480} height={3508} /><figcaption><button type="button" className={styles.textButton} onClick={() => download(record!.pages[index]!, `六经注我-手写纪念卡-${index + 1}.png`)}>保存第 {index + 1} 页 PNG</button></figcaption></figure>)}
      {record?.pdf && <button type="button" className={styles.quietButton} onClick={() => download(record.pdf!, '六经注我-手写纪念卡.pdf')}>保存完整 PDF</button>}
      {history.length > 0 && <details className={card.history}><summary>本机导出记录</summary>{history.filter(item => item.key !== record?.key).map(item => <button key={item.key} type="button" className={styles.libraryRow} disabled={busy || composing || !!pending} onClick={() => void openHistory(item.key)}><span>{item.draft.quote.slice(0, 40)}</span><span className={styles.muted}>{item.job ? STATUS_LABEL[item.job.status] : '草稿'} · {item.draft.dateLabel}</span></button>)}</details>}
      <footer className={card.footer}><p className={styles.muted}>仅发送确认的内容。成品保留 AI 标识；本站素材保存七天，Inko 副本最长保存三十天。下载后的文件由你保管。</p><button type="button" className={styles.textButton} disabled={busy} onClick={() => void clear()}>清理手写草稿与导出记录</button></footer>
    </section>
  </div>;
}
