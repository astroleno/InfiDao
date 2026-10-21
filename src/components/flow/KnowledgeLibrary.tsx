'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readingGraph } from '@/lib/flow-browser/graph';
import { readingStorage } from '@/lib/flow-browser/storage';
import { knowledgeKinds, passageIdentity, type KnowledgeLibrary as Library, type KnowledgeEntry } from '@/lib/flow-browser/knowledge';
import type { SavedTarget } from '@/lib/flow-browser/library';
import styles from './flow.module.css';

export function KnowledgeLibrary({ context, opening, onOpen }: {
  context?: SavedTarget | undefined; opening: boolean; onOpen: (target: SavedTarget) => Promise<void>;
}) {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const contextPathId = context?.pathId, contextFrameId = context?.frameId;
  useEffect(() => {
    let alive = true;
    setError(''); setData(null);
    void Promise.all([readingGraph.library(), contextPathId ? readingStorage.loadPath(contextPathId) : null]).then(([library, path]) => {
      if (!alive) return;
      const frame = path?.chain.frames.find((item: { id: string }) => item.id === contextFrameId);
      const initial = frame ? passageIdentity(frame) : null;
      setData(library); setSelected(initial && library.entries.some(entry => entry.node.id === initial) ? initial : null);
      setHistory([]);
    }).catch(() => { if (alive) setError('关联暂时未能取回，请重试。'); });
    return () => { alive = false; };
  }, [contextPathId, contextFrameId, retry]);
  useEffect(() => { if (focusDetail.current) { detailRef.current?.focus(); focusDetail.current = false; } }, [selected]);
  const entries = useMemo(() => new Map(data?.entries.map(entry => [entry.node.id, entry]) || []), [data]);
  const current = selected ? entries.get(selected) : undefined;
  const matches = useMemo(() => {
    const text = query.trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
    return data?.entries.filter(entry => (kind === 'all' || entry.node.kind === kind) &&
      (!text || `${entry.label} ${entry.detail} ${entry.source}`.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(text))) || [];
  }, [data, query, kind]);
  const connections = useMemo(() => {
    const seen = new Set<string>();
    return data?.connections.filter(link => {
      if (link.from !== selected && link.to !== selected) return false;
      const key = JSON.stringify([link.from, link.to, link.label, link.description]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }) || [];
  }, [data, selected]);
  function choose(entry: KnowledgeEntry) {
    if (selected) setHistory(previous => [...previous.slice(-99), selected]);
    focusDetail.current = true; setSelected(entry.node.id); setLimit(20);
  }
  function browse() { setSelected(null); setHistory([]); setLimit(20); }
  return <div className={styles.knowledgeLibrary}>
    {error ? <p role="status">{error} <button type="button" className={styles.textButton} onClick={() => setRetry(value => value + 1)}>重试</button></p> :
      !data ? <p className={styles.muted} role="status">正在取回关联…</p> : <>
        <div className={styles.knowledgeSearch}>
          <label className={styles.srOnly} htmlFor="flow-knowledge-search">查找经句、义项或主题</label>
          <input id="flow-knowledge-search" type="search" value={query} placeholder="查找经句、义项或主题"
            onChange={event => { setQuery(event.target.value); browse(); }} />
          <select aria-label="关联类型" value={kind} onChange={event => { setKind(event.target.value); browse(); }}>
            <option value="all">全部类型</option>
            {Object.entries(knowledgeKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {!readingGraph.status().persisted && <p role="status" className={styles.muted}>部分关联仅在当前会话可用，请稍后重试保存。</p>}
        {current ? <>
          <div className={styles.knowledgeDetail}>
            <div className={styles.knowledgeContext}>
              <button type="button" className={styles.textButton} onClick={() => {
                if (history.length) { focusDetail.current = true; setSelected(history[history.length - 1]!); setHistory(previous => previous.slice(0, -1)); }
                else browse();
              }}>{history.length ? '返回上一项' : '浏览全部关联'}</button>
              <span className={styles.muted}>{knowledgeKinds[current.node.kind]}{current.source && ` · ${current.source}`}</span>
            </div>
            <h3 ref={detailRef} tabIndex={-1}>{current.label}</h3>
            {current.detail && <p>{current.detail}</p>}
            {current.node.kind === 'sense' && !current.detail && <p className={styles.muted}>这处用法保留了原语境，尚无单独的词义说明。</p>}
            {current.node.kind === 'sense' && <blockquote>{current.node.excerpt}</blockquote>}
            {current.original ? <button type="button" className={styles.textButton} disabled={opening} onClick={() => void onOpen(current.original!)}>回到原文</button> :
              (current.node.kind === 'passage' || current.node.kind === 'sense') && <p className={styles.muted}>原阅读记录不可用，已保存的关联仍可查看。</p>}
          </div>
          <p className={styles.muted} role="status">{connections.length ? `${connections.length} 条直接关联` : '这处还没有其他已保存的关联。'}</p>
          {connections.map(link => {
            const outgoing = link.from === selected;
            const neighbor = entries.get(outgoing ? link.to : link.from);
            if (!neighbor) return null;
            return <article key={link.id} className={styles.knowledgeRelation}>
              <p className={styles.muted}>{outgoing ? '连向' : '来自'} · {link.label}</p>
              <button type="button" className={styles.knowledgeLink} onClick={() => choose(neighbor)}>
                <span className={styles.muted}>{knowledgeKinds[neighbor.node.kind]}</span><span>{neighbor.label}</span>
              </button>
              {link.description && <p>{link.description}</p>}
              {neighbor.source && <p className={styles.muted}>{neighbor.source}</p>}
              {neighbor.original && <button type="button" className={styles.textButton} disabled={opening} aria-label={`查看「${neighbor.label}」的原文`}
                onClick={() => void onOpen(neighbor.original!)}>查看原文</button>}
            </article>;
          })}
        </> : <>
          <p className={styles.muted} role="status">{data.entries.length ? `找到 ${matches.length} 项` : '读过的经句、义项与主题会留在这里。'}</p>
          {data.entries.length > 0 && !matches.length && <p className={styles.libraryEmpty}>没有找到匹配的内容，可以换个词或查看全部类型。</p>}
          {matches.slice(0, limit).map(entry => <button type="button" key={entry.node.id} className={styles.libraryRow} onClick={() => choose(entry)}>
            <span className={styles.muted}>{knowledgeKinds[entry.node.kind]}{entry.source && ` · ${entry.source}`}</span>
            <span className={styles.libraryQuote}>{entry.label}</span>{entry.detail && <span>{entry.detail}</span>}
          </button>)}
          {matches.length > limit && <button type="button" className={styles.textButton} onClick={() => setLimit(value => value + 20)}>再看一些关联</button>}
        </>}
      </>}
  </div>;
}
