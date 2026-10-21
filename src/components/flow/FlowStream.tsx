'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { FlowSelection } from '@/lib/flow-browser/controller-host';
import { entryKey, type StreamEntry } from '@/lib/flow-browser/continuity';
import { quoteKey } from '@/lib/flow-browser/library';
import { ribbonProjection } from '@/lib/flow-browser/ribbon-optics';
import { EntranceMotion, InkMotion } from '@/lib/flow-browser/entrance-motion';
import { StreamGlass, type OpticalRun } from '@/lib/flow-browser/stream-glass';
import { bendSettings, bendSourcePoint, bindBendInteraction, type BendSettings } from '@/lib/flow-browser/bend';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import { LinkedText } from './LinkedText';
import { NotesPanel } from './NotesPanel';
import { StreamActions } from './StreamActions';
import styles from './flow.module.css';

type Props = {
  entries: StreamEntry[];
  activeKey: string;
  paused: boolean;
  reducedMotion: boolean;
  pending: boolean;
  connecting: FlowSelection | null;
  waiting?: ReactNode;
  restore: { revision: number; top: number; frameId?: string; entryKey?: string; source?: boolean };
  canContinue: boolean;
  onContinue: () => void;
  onPrepareNext: () => void;
  onPause: () => void;
  onRead: (entry: StreamEntry) => void;
  onScroll: (top: number) => void;
  onVisualReady: () => void;
  onBranch: (selection: FlowSelection & { label: string }) => void;
  sourceOpen: boolean;
  onToggleSource: () => void;
  bookmarkKeys: Set<string>;
  onBookmark: () => void;
  notesFrameId: string | null;
  notes: PersonalNote[];
  savingNote: boolean;
  onSaveNote: (text: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUndoNote: () => Promise<void>;
  onUpdateNote: (id: string, text: string) => Promise<void>;
};

export function FlowStream(props: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const optics = useRef<() => void>(() => {});
  const measure = useRef<() => void>(() => {});
  const entrance = useRef({ pause: () => {}, resume: () => {} });
  const previousFlow = useRef({ paused: props.paused, revision: props.restore.revision });
  const intended = useRef(false);
  const preparedAt = useRef('');
  const continuedAt = useRef('');
  const [notesFor, setNotesFor] = useState<string | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.scrollTop = props.restore.top;
    // Source navigation lands on the quoted occurrence in the full original.
    if (props.restore.source && props.restore.frameId) {
      const article = Array.from(panel.querySelectorAll<HTMLElement>('[data-flow-frame]'))
        .find(node => props.restore.entryKey ? node.dataset.streamKey === props.restore.entryKey : node.dataset.flowFrame === props.restore.frameId);
      const target = article?.querySelector<HTMLElement>('[data-flow-source] [data-source-quote]') || article?.querySelector<HTMLElement>('[data-flow-source]');
      if (target) {
        let top = 0, node: HTMLElement | null = target;
        while (node && node !== panel) { top += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
        panel.scrollTop = Math.max(0, top - panel.clientHeight * .42);
      }
    // Older readers stored a nonzero offset within their own chain. A saved
    // passage also anchors offsets after a viewport or typography change.
    } else if (props.restore.frameId) {
      const article = Array.from(panel.querySelectorAll<HTMLElement>('[data-flow-frame]'))
        .find(node => props.restore.entryKey ? node.dataset.streamKey === props.restore.entryKey : node.dataset.flowFrame === props.restore.frameId);
      if (article) {
        let top = 0, node: HTMLElement | null = article;
        while (node && node !== panel) { top += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
        const focus = panel.scrollTop + panel.clientHeight * .42;
        if (!props.restore.top || focus < top || focus >= top + article.offsetHeight) {
          panel.scrollTop = Math.max(0, top - panel.clientHeight * .25);
        }
      }
    }
    intended.current = false;
    measure.current();
  }, [props.restore]);

  useEffect(() => { if (props.notesFrameId) setNotesFor(props.notesFrameId); }, [props.notesFrameId]);

  useLayoutEffect(() => { measure.current(); }, [props.entries, props.sourceOpen, notesFor]);

  useEffect(() => {
    const panel = panelRef.current, content = contentRef.current;
    if (!panel || !content) return;
    let handle = 0, last = 0, remainder = 0, disposed = false;
    type Part = { element: HTMLElement; top: number; bottom: number; motion: EntranceMotion; ink: InkMotion };
    let parts: Part[] = [];
    const motions = new WeakMap<HTMLElement, EntranceMotion>();
    const inks = new WeakMap<HTMLElement, InkMotion>();
    type Hit = { element: HTMLElement; x: number; y: number; width: number; height: number };
    let words: Array<{ element: HTMLElement; x: number; y: number; wordWidth: number; wordHeight: number; profile: string;
      text: string; font: string; spacing: string; color: string; quiet: boolean; part: Part | undefined; links: Hit[]; inkIndex: number }> = [];
    let drawn: { settings: BendSettings; hits: Hit[] } | null = null;
    let width = 0;
    let glass: StreamGlass | null = null;
    let measurement = 0, lastPaint = '';
    let lastFocus: Element | null = null;

    const paint = (time: number) => {
      const height = panel.clientHeight;
      if (!height) return false;
      let stagger = 0, moving = false;
      for (const part of parts) {
        if (part.bottom < panel.scrollTop) { part.motion.finish(); part.ink.finish(); }
        if (part.element.contains(document.activeElement)) {
          if (part.motion.waiting) part.motion.finish();
          else part.motion.pause(time);
          part.ink.finish();
        }
        if (part.top - panel.scrollTop < height - 24 && part.bottom > panel.scrollTop) {
          const delay = part.motion.waiting ? stagger++ * 90 : 0;
          part.motion.begin(time, delay);
          part.ink.begin(time, delay);
        }
        moving = part.motion.sample(time, width, live.current.reducedMotion) || moving;
        moving = part.ink.sample(time, live.current.reducedMotion) || moving;
        part.element.dataset.entryPhase = part.motion.phase;
        part.element.dataset.inkPhase = part.ink.phase;
      }
      const offsets = parts.map(part => `${part.motion.offset.toFixed(3)}:${part.ink.key}`).join(':');
      const key = `${panel.scrollTop}:${width}:${height}:${measurement}:${live.current.reducedMotion}:${offsets}`;
      if (key === lastPaint && lastFocus === document.activeElement) return moving;
      lastPaint = key;
      lastFocus = document.activeElement;
      const runs: OpticalRun[] = [];
      const hits: Hit[] = [];
      const bend = bendSettings(width, height), zone = bend.zone * height;
      for (const word of words) {
        const screenY = word.y - panel.scrollTop;
        if (screenY < -70 || screenY > height + 70) {
          if (word.profile !== 'outside') {
            // Offscreen words stay keyboard-focusable. Native scrolling brings
            // the very same button back into the optical reading band.
            word.element.style.transform = 'none';
            word.element.style.removeProperty('transform-origin');
            word.element.style.opacity = '1';
            word.element.style.filter = 'none';
            word.element.removeAttribute('data-flow-bent');
            word.element.removeAttribute('data-flow-ink');
            word.profile = 'outside';
          }
          continue;
        }
        const projection = ribbonProjection({
          ...word, viewportWidth: width, viewportHeight: height,
          scrollTop: panel.scrollTop, reducedMotion: live.current.reducedMotion,
        });
        const focused = word.element.contains(document.activeElement);
        const blur = focused || word.quiet ? 0 : projection.blur;
        const offset = word.part?.motion.offset || 0;
        const folded = !live.current.reducedMotion && !word.quiet &&
          (screenY - word.wordHeight * projection.scale / 2 < zone || screenY + word.wordHeight * projection.scale / 2 > height - zone);
        const progress = word.part?.ink.progress(word.inkIndex, Array.from(word.text).length);
        const inking = !live.current.reducedMotion && !!progress?.some(value => value < 1);
        word.element.toggleAttribute('data-flow-bent', folded);
        word.element.toggleAttribute('data-flow-ink', inking);
        const transform = offset ? `translateX(${offset.toFixed(3)}px) ${projection.transform}` : projection.transform;
        if (!word.quiet) runs.push({
          text: word.text, font: word.font, spacing: word.spacing, color: word.color,
          x: width / 2 + (word.x - width / 2) * projection.scale + offset,
          y: screenY, scale: projection.scale,
          folded, opacity: projection.opacity, blur,
          surface: word.part?.element.dataset.flowEntrance as OpticalRun['surface'] || 'fullText',
          ...(inking && progress ? { ink: progress } : {}),
          highlighted: focused || !!word.element.querySelector('[data-bend-hover]'),
        });
        for (const link of word.quiet ? [] : word.links) hits.push({ ...link,
          x: width / 2 + (link.x - width / 2) * projection.scale + offset,
          y: screenY + (link.y - word.y) * projection.scale,
          width: link.width * projection.scale, height: link.height * projection.scale });
        const profile = `${transform}:${blur.toFixed(3)}:${projection.opacity.toFixed(3)}`;
        if (word.profile === profile) continue;
        word.profile = profile;
        word.element.style.transformOrigin = projection.origin;
        word.element.style.transform = transform;
        word.element.style.opacity = String(projection.opacity);
        word.element.style.filter = blur ? `blur(${blur.toFixed(3)}px)` : 'none';
      }
      glass?.draw(runs, width, height, live.current.reducedMotion);
      drawn = { settings: bend, hits };
      return moving;
    };

    const schedule = () => {
      if (!handle && !disposed) handle = requestAnimationFrame(tick);
    };
    const tick = (time: number) => {
      handle = 0;
      const p = live.current;
      if (!p.paused && !p.reducedMotion && !document.hidden && p.entries.length) {
        const elapsed = last ? Math.min(48, time - last) : 0;
        // Slow enough to read complete paragraphs. Preserve subpixel movement
        // even in browsers which quantize scrollTop to device pixels.
        remainder += elapsed * .012;
        if (remainder >= 1) {
          const move = Math.floor(remainder);
          panel.scrollTop += move;
          remainder -= move;
        }
        last = time;
        schedule();
      } else last = 0;
      if (paint(time)) schedule();
    };
    optics.current = schedule;
    entrance.current = {
      pause: () => { const now = performance.now(); parts.forEach(part => { part.motion.pause(now); part.ink.pause(now); }); schedule(); },
      resume: () => { const now = performance.now(); parts.forEach(part => { part.motion.resume(now); part.ink.resume(now); }); schedule(); },
    };
    const positionOf = (element: HTMLElement) => {
      let x = element.offsetWidth / 2, y = element.offsetHeight / 2;
      let node: HTMLElement | null = element;
      while (node && node !== panel) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return { x, y };
    };
    const remeasure = () => {
      measurement++;
      width = content.clientWidth;
      const byElement = new Map<HTMLElement, Part>();
      parts = Array.from(content.querySelectorAll<HTMLElement>('[data-flow-entrance]')).map(element => {
        let motion = motions.get(element);
        if (!motion) {
          motion = new EntranceMotion(Number(element.dataset.entryOrder) % 2 ? 1 : -1);
          motions.set(element, motion);
        }
        let ink = inks.get(element);
        if (!ink) { ink = new InkMotion(); inks.set(element, ink); }
        const { y } = positionOf(element);
        const part = { element, top: y - element.offsetHeight / 2, bottom: y + element.offsetHeight / 2, motion, ink };
        byElement.set(element, part);
        return part;
      });
      words = Array.from(content.querySelectorAll<HTMLElement>('[data-flow-optic]')).map(element => {
        element.style.removeProperty('visibility');
        // offset geometry ignores our transforms and remains stable while paused.
        const { x, y } = positionOf(element);
        // x is panel-relative; its optical axis is the viewport center.
        const style = getComputedStyle(element);
        return { element, x, y, wordWidth: element.offsetWidth, profile: '',
          wordHeight: element.offsetHeight, inkIndex: 0,
          text: element.textContent || '', font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          spacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
          color: style.color, quiet: element.dataset.flowOptic === 'quiet',
          links: Array.from(element.querySelectorAll<HTMLElement>('button')).map(button => ({
            element: button, ...positionOf(button), width: button.offsetWidth, height: button.offsetHeight,
          })),
          part: byElement.get(element.closest<HTMLElement>('[data-flow-entrance]')!) };
      });
      const textByPart = new Map<Part, string>();
      for (const word of words) if (word.part) {
        const prefix = textByPart.get(word.part) || '';
        word.inkIndex = Array.from(prefix).length;
        textByPart.set(word.part, prefix + word.text);
      }
      for (const part of parts) part.ink.sync(textByPart.get(part) || '');
      width = panel.clientWidth;
      schedule();
    };
    measure.current = remeasure;
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    resize?.observe(content);
    resize?.observe(panel);
    document.fonts?.addEventListener('loadingdone', remeasure);
    // Verified FontFaces are loaded before document.fonts.add(), so adding a
    // late ancestor's face need not emit loadingdone or change line geometry.
    // The installed family list is the typography contract used by native text.
    let classicFamily = document.documentElement.style.getPropertyValue('--flow-classic-family');
    const fontStyles = new MutationObserver(() => {
      const next = document.documentElement.style.getPropertyValue('--flow-classic-family');
      if (next !== classicFamily) { classicFamily = next; remeasure(); }
    });
    fontStyles.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const onFocus = () => { entrance.current.pause(); };
    panel.addEventListener('focusin', onFocus);
    panel.addEventListener('focusout', schedule);
    document.addEventListener('visibilitychange', schedule);
    if (glassRef.current) glass = new StreamGlass(glassRef.current, () => { measurement++; schedule(); });
    const unbindBend = bindBendInteraction(panel, (clientX, clientY) => {
      if (!drawn || live.current.reducedMotion || glassRef.current?.dataset.optics !== 'ready') return undefined;
      const rect = panel.getBoundingClientRect(), shape = drawn.settings;
      if (!rect.width || !rect.height) return undefined;
      const x = (clientX - rect.left) * shape.width / rect.width;
      const y = (clientY - rect.top) * shape.height / rect.height;
      if (y > shape.zone * shape.height && y < (1 - shape.zone) * shape.height) return undefined;
      const point = bendSourcePoint(x, y, shape);
      if (!point.alpha) return null;
      const hit = drawn.hits.find(hit => hit.element.isConnected &&
        Math.abs(point.x - hit.x) <= hit.width / 2 && Math.abs(point.y - hit.y) <= hit.height / 2);
      return hit?.element || null;
    }, () => { measurement++; schedule(); });
    remeasure();
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      resize?.disconnect();
      fontStyles.disconnect();
      document.fonts?.removeEventListener('loadingdone', remeasure);
      panel.removeEventListener('focusin', onFocus);
      panel.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', schedule);
      glass?.destroy();
      unbindBend();
      for (const { element } of words) {
        for (const name of ['transform', 'transform-origin', 'filter', 'opacity', 'visibility']) element.style.removeProperty(name);
        element.removeAttribute('data-flow-bent');
        element.removeAttribute('data-flow-ink');
      }
      optics.current = () => {};
      measure.current = () => {};
      entrance.current = { pause: () => {}, resume: () => {} };
    };
  }, []);

  useEffect(() => {
    if (previousFlow.current.paused !== props.paused) {
      // Restoring a saved paused reading position is not a user interruption.
      if (props.paused && previousFlow.current.revision === props.restore.revision) entrance.current.pause();
      else entrance.current.resume();
    }
    previousFlow.current = { paused: props.paused, revision: props.restore.revision };
    optics.current();
  }, [props.paused, props.reducedMotion, props.restore.revision]);
  const count = props.entries.length;
  useEffect(() => {
    if (count) live.current.onVisualReady();
  }, [count]);

  const pause = () => {
    intended.current = true;
    entrance.current.pause();
    props.onPause();
  };
  function onScroll() {
    const panel = panelRef.current;
    if (!panel) return;
    optics.current();
    props.onScroll(panel.scrollTop);
    const articles = Array.from(panel.querySelectorAll<HTMLElement>('[data-flow-frame]'));
    const edge = panel.scrollTop + panel.clientHeight * .38;
    const visible = articles.filter(article => article.offsetTop <= edge).at(-1) || articles[0];
    const entry = props.entries.find(item => entryKey(item) === visible?.dataset.streamKey);
    const editing = panel.querySelector('textarea:focus, input:focus');
    if (entry && entryKey(entry) !== props.activeKey && !editing && !props.sourceOpen && !notesFor) props.onRead(entry);
    if ((!intended.current && props.paused) || editing || props.pending || !props.canContinue) return;
    const tail = articles.at(-1);
    if (!tail) return;
    const cursor = props.entries.at(-1);
    const key = cursor ? entryKey(cursor) : '';
    const gap = tail.offsetTop + tail.offsetHeight - panel.scrollTop - panel.clientHeight * .82;
    if (gap < panel.clientHeight * .6 && preparedAt.current !== key) {
      preparedAt.current = key;
      props.onPrepareNext();
    }
    if (gap < 32 && continuedAt.current !== key) {
      continuedAt.current = key;
      intended.current = false;
      props.onContinue();
    }
  }

  const waitingKey = props.connecting
    ? props.entries.find(item => item.frame.id === props.connecting?.frameId && (!props.connecting.pathId || item.pathId === props.connecting.pathId))
    : props.entries.at(-1);

  return <section className={styles.stream} aria-label="连续经文流" data-flow-stream data-paused={props.paused} data-pending={props.pending}>
    <canvas ref={glassRef} className={styles.streamGlass} data-flow-glass aria-hidden="true" />
    <div ref={panelRef} className={styles.streamViewport} tabIndex={0} aria-label="经文阅读" data-flow-viewport
      onWheel={pause} onTouchMove={pause} onPointerDown={() => { entrance.current.pause(); props.onPause(); }} onScroll={onScroll}
      onKeyDown={event => {
        if (!event.altKey && !event.ctrlKey && !event.metaKey) {
          entrance.current.pause();
          props.onPause();
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) intended.current = true;
        }
      }}>
      <div ref={contentRef} className={styles.streamContent}>
        {props.entries.map((entry, entryIndex) => {
          const key = entryKey(entry), item = entry.frame, current = key === props.activeKey;
          const connecting = props.connecting?.pathId && props.connecting.pathId !== entry.pathId ? null : props.connecting;
          const bookmarked = props.bookmarkKeys.has(quoteKey(item));
          const select = (selection: FlowSelection & { label: string }) => {
            intended.current = false;
            props.onRead(entry);
            props.onBranch({ ...selection, pathId: entry.pathId });
          };
          return <article key={key} data-flow-frame={item.id} data-flow-path={entry.pathId} data-stream-key={key} data-flow-ready={item.ready !== false}
            className={styles.streamNode} aria-label={`${item.source} · ${item.chapterLabel}`}>
            <blockquote className={styles.streamQuote} data-flow-heading data-flow-entrance="quote"
              data-entry-order={entryIndex * 3} data-entry-side={entryIndex % 2 ? 'right' : 'left'}>
              <LinkedText optical frame={item} surface="quote" onSelect={select} connecting={connecting} />
            </blockquote>
            {item.meaning && <div className={styles.streamMeaning} data-flow-surface="meaning" aria-label="释义"
              data-flow-entrance="meaning" data-entry-order={entryIndex * 3 + 1} data-entry-side={entryIndex % 2 ? 'left' : 'right'}>
              <p><LinkedText optical frame={item} surface="meaning" onSelect={select} connecting={connecting} /></p>
            </div>}
            {(item.ready !== false || item.settled?.reflection) && item.reflection && <div className={styles.streamReflection} data-flow-surface="reflection"
              aria-label="此刻回响" data-flow-entrance="reflection" data-entry-order={entryIndex * 3 + (item.meaning ? 2 : 1)}
              data-entry-side={(entryIndex + (item.meaning ? 0 : 1)) % 2 ? 'right' : 'left'}>
              <p><LinkedText optical frame={item} surface="reflection" onSelect={select} connecting={connecting} /></p>
            </div>}
            <StreamActions source={`${item.source} · ${item.chapterLabel}`} sourceOpen={current && props.sourceOpen}
              bookmarked={bookmarked} notesOpen={current && (notesFor === key || notesFor === item.id)}
              noteCount={current ? props.notes.length : 0} onOpen={() => { props.onPause(); props.onRead(entry); }}
              onSource={() => { props.onRead(entry); props.onToggleSource(); }}
              onBookmark={() => { props.onRead(entry); props.onBookmark(); }}
              onNotes={() => { props.onRead(entry); setNotesFor(notesFor === key || notesFor === item.id ? null : key); }} />
            {current && props.sourceOpen && <div className={styles.streamSourceText} data-flow-source>
              <p className={styles.sectionLabel}>{item.source} · {item.chapterLabel} · 完整原文</p>
              <p className={styles.fullSource}><LinkedText optical frame={item} surface="fullText" onSelect={select} connecting={connecting} /></p>
              {entry.kind === 'remote' && <p className={styles.streamProvenance}>原文来自六经资料库；释义与回响由 AI 生成，供参照。</p>}
            </div>}
            {current && (notesFor === key || notesFor === item.id) && <NotesPanel key={key} draftKey={JSON.stringify([entry.chainId, item.id])}
              notes={props.notes} saving={props.savingNote} onSave={props.onSaveNote} onDelete={props.onDeleteNote}
              onUndo={props.onUndoNote} onUpdate={props.onUpdateNote} />}
            {waitingKey && key === entryKey(waitingKey) && props.waiting && <div className={styles.streamWaiting}>{props.waiting}</div>}
          </article>;
        })}
        <div className={styles.streamEnd}>
          {props.canContinue && <button className={styles.textButton} type="button" disabled={props.pending} onClick={() => {
            props.onPause(); intended.current = false; props.onContinue();
          }}>沿此意继续</button>}
        </div>
      </div>
    </div>
  </section>;
}
