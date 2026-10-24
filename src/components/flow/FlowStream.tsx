'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { FlowSelection } from '@/lib/flow-browser/controller-host';
import { entryKey, type StreamEntry } from '@/lib/flow-browser/continuity';
import { quoteKey } from '@/lib/flow-browser/library';
import { streamBendSettings, streamProjection, type StreamMotionVariant } from '@/lib/flow-browser/motion-profile';
import { EntranceMotion, InkMotion } from '@/lib/flow-browser/entrance-motion';
import { ScrollNoiseMotion, SettlingScrollNoiseMotion } from '@/lib/flow-browser/liquid-motion';
import { StreamGlass, type OpticalRun } from '@/lib/flow-browser/stream-glass';
import { StreamSceneIndex } from '@/lib/flow-browser/stream-scene';
import { StreamFramePlanner } from '@/lib/flow-browser/stream-frame-plan';
import { StreamManualScroll, StreamScrollMotion } from '@/lib/flow-browser/stream-scroll-motion';
import { bendSourcePoint, bindBendInteraction, type BendSettings } from '@/lib/flow-browser/bend';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import { LinkedText } from './LinkedText';
import { NotesPanel } from './NotesPanel';
import { FlowMenu } from './FlowMenu';
import { MeaningPopover } from './MeaningPopover';
import styles from './flow.module.css';

// Active-passage updates retain the native text subtree for every other
// passage. The same buttons keep their identity and keyboard focus.
const RetainedLinkedText = memo(LinkedText);

type Props = {
  entries: StreamEntry[];
  activeKey: string;
  paused: boolean;
  autoScroll?: boolean;
  reducedMotion: boolean;
  motionVariant?: StreamMotionVariant;
  motionSeed?: number;
  navigation?: Pick<ComponentProps<typeof FlowMenu>, 'onThought' | 'onLibrary' | 'libraryDisabled' | 'motionCandidate'>;
  /** Comparison fixtures may start settled; reader materials never disable entry. */
  settleEntrance?: boolean;
  pending: boolean;
  connecting: FlowSelection | null;
  waiting?: ReactNode;
  restore: { revision: number; top: number; frameId?: string; entryKey?: string; source?: boolean };
  canContinue: boolean;
  onContinue: () => void;
  onPrepareNext: () => void;
  onPause: () => void;
  onResume?: () => void;
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
  const articleScene = useRef(new StreamSceneIndex<{ top: number; bottom: number; order: number; entry: StreamEntry }>());
  const previousFlow = useRef({ paused: props.paused, revision: props.restore.revision });
  const intended = useRef(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean; resume: boolean; key: string } | null>(null);
  const preparedAt = useRef('');
  const continuedAt = useRef('');
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [scrollMotion] = useState(() => new StreamScrollMotion(props.restore.top));
  const [manualScroll] = useState(() => new StreamManualScroll());
  const [meaningFor, setMeaningFor] = useState<string | null>(null);
  const meaningResume = useRef(false);
  const meaningPress = useRef<{ timer: number; key: string; resume: boolean; top: number; trigger: HTMLElement | null } | null>(null);
  const meaningTrigger = useRef<HTMLElement | null>(null);
  const menuResume = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const suppressPressClick = useRef(false);
  const opticalHit = useRef<(x: number, y: number) => HTMLElement | null | undefined>(() => undefined);
  const contentEntries = useMemo(() => props.entries.map(entry => ({
    entry,
    select: (selection: Parameters<ComponentProps<typeof LinkedText>['onSelect']>[0]) => {
      intended.current = false;
      meaningResume.current = false;
      setMeaningFor(null);
      live.current.onRead(entry);
      live.current.onBranch({ ...selection, pathId: entry.pathId });
    },
  })), [props.entries]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let wantedTop = props.restore.top;
    panel.scrollTop = wantedTop;
    // Source navigation lands on the quoted occurrence in the full original.
    if (props.restore.source && props.restore.frameId) {
      const article = Array.from(panel.querySelectorAll<HTMLElement>('[data-flow-frame]'))
        .find(node => props.restore.entryKey ? node.dataset.streamKey === props.restore.entryKey : node.dataset.flowFrame === props.restore.frameId);
      const target = article?.querySelector<HTMLElement>('[data-flow-source] [data-source-quote]') || article?.querySelector<HTMLElement>('[data-flow-source]');
      if (target) {
        let top = 0, node: HTMLElement | null = target;
        while (node && node !== panel) { top += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
        panel.scrollTop = wantedTop = Math.max(0, top - panel.clientHeight * .42);
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
          panel.scrollTop = wantedTop = Math.max(0, top - panel.clientHeight * .25);
        }
      }
    }
    const limit = Math.max(panel.scrollTop, panel.scrollHeight - panel.clientHeight);
    scrollMotion.reset(Math.max(0, Math.min(limit, wantedTop)), panel.scrollTop);
    manualScroll.reset();
    if (contentRef.current) {
      const remainder = scrollMotion.position(panel.scrollTop) - panel.scrollTop;
      contentRef.current.style.translate = remainder ? `0 ${-remainder}px` : '';
    }
    intended.current = false;
    measure.current();
  }, [props.restore, scrollMotion, manualScroll]);

  useEffect(() => { if (props.notesFrameId) setNotesFor(props.notesFrameId); }, [props.notesFrameId]);

  useEffect(() => {
    meaningResume.current = false;
    setMeaningFor(null);
    setMenuOpen(false);
    setMenuFor(null);
    if (meaningPress.current) window.clearTimeout(meaningPress.current.timer);
    meaningPress.current = null;
  }, [props.restore.revision]);

  useEffect(() => {
    const cancel = () => {
      if (meaningPress.current) window.clearTimeout(meaningPress.current.timer);
      meaningPress.current = null;
      manualScroll.reset();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [manualScroll]);

  useLayoutEffect(() => { measure.current(); }, [props.entries, props.sourceOpen, notesFor]);

  useEffect(() => {
    const panel = panelRef.current, content = contentRef.current;
    if (!panel || !content) return;
    let handle = 0, disposed = false;
    type Part = { element: HTMLElement; top: number; bottom: number; order: number; motion: EntranceMotion; ink: InkMotion; inkPhase: string };
    let parts: Part[] = [];
    const motions = new WeakMap<HTMLElement, EntranceMotion>();
    const inks = new WeakMap<HTMLElement, InkMotion>();
    type Hit = { element: HTMLElement; x: number; y: number; width: number; height: number };
    type Word = { element: HTMLElement; x: number; y: number; top: number; bottom: number; order: number;
      wordWidth: number; wordHeight: number; profile: string; count: number;
      text: string; font: string; spacing: string; color: string; quiet: boolean; part: Part | undefined;
      links: Hit[]; hits: Hit[]; inkIndex: number; progress: number[]; run: OpticalRun };
    let words: Word[] = [];
    const wordRecords = new WeakMap<HTMLElement, Word>();
    const partRecords = new Map<HTMLElement, Part>();
    const partIndex = new StreamSceneIndex<Part>(), wordIndex = new StreamSceneIndex<Word>();
    const activeParts = new Set<Part>(), workParts = new Set<Part>();
    const visibleParts: Part[] = [], visibleWords: Word[] = [];
    let previousWords = new Set<Word>(), nextWords = new Set<Word>();
    const planner = new StreamFramePlanner();
    let settledAll = false, nextWordId = 0;
    let passedUntil = -Infinity, frameWordsVisited = 0;
    // Local diagnostics opt in before mounting. Normal reading does not time,
    // copy or publish per-frame records, nor read back GPU results.
    const probe = (window as Window & { __INFIDAO_FLOW_RENDER_PROBE__?: (frame: Record<string, unknown>) => void }).__INFIDAO_FLOW_RENDER_PROBE__;
    const layoutProbe = { count: 0, totalMs: 0, lastMs: 0, reason: '' };
    let drawMs = 0;
    let fastManualScroll = false;
    let pendingMeasure: 'resize' | 'font' | null = null, measuredSize = '';
    const layoutSize = () => `${content.clientWidth}:${content.clientHeight}:${panel.clientWidth}:${panel.clientHeight}`;
    let drawn: { settings: BendSettings; hits: Hit[] } | null = null;
    let width = 0;
    let glass: StreamGlass | null = null;
    let liquidNoise: ScrollNoiseMotion | undefined;
    const surfaceMotions = new Map<StreamMotionVariant, SettlingScrollNoiseMotion>();
    const cachedRuns: OpticalRun[] = [], cachedHits: Hit[] = [];

    const finishPart = (part: Part) => {
      if (part.motion.offset || part.ink.phase !== 'settled') planner.invalidate('motion');
      part.motion.finish(); part.ink.finish(); part.inkPhase = 'settled';
      if (part.element.dataset.entryPhase !== 'settled') part.element.dataset.entryPhase = 'settled';
      if (part.element.dataset.inkPhase !== 'settled') part.element.dataset.inkPhase = 'settled';
      activeParts.delete(part);
    };

    const paint = (time: number) => {
      frameWordsVisited = 0;
      const height = panel.clientHeight;
      if (!height) return false;
      const scrollTop = scrollMotion.position(panel.scrollTop), activeElement = document.activeElement;
      fastManualScroll = manualScroll.sample(scrollTop, time, height);
      const canvasOwnsGlyphs = !live.current.reducedMotion && glassRef.current?.dataset.optics === 'ready';
      const variant = live.current.motionVariant || 'liquid-live';
      let stagger = 0, moving = false;
      const settleAll = !!live.current.settleEntrance || live.current.reducedMotion;
      if (settleAll && !settledAll) parts.forEach(finishPart);
      settledAll = settleAll;
      // A jump can skip years of retained history. Remember the boundary and
      // settle a skipped paragraph only when it becomes relevant again.
      passedUntil = Math.max(passedUntil, scrollTop);
      workParts.clear();
      partIndex.visible(scrollTop, scrollTop + height - 24, visibleParts);
      for (const part of visibleParts) workParts.add(part);
      for (const part of activeParts) workParts.add(part);
      const focusedPart = activeElement instanceof Element ? partRecords.get(activeElement.closest<HTMLElement>('[data-flow-entrance]')!) : undefined;
      if (focusedPart) workParts.add(focusedPart);
      for (const part of workParts) {
        if (part.bottom < passedUntil) { finishPart(part); continue; }
        const previousOffset = Math.round(part.motion.offset * 1000), previousInk = part.ink.revision;
        if (fastManualScroll) part.ink.finish();
        if (part.element.contains(activeElement)) {
          if (part.motion.waiting) part.motion.finish();
          else part.motion.pause(time);
          part.ink.finish();
        }
        if (part.top - scrollTop < height - 24 && part.bottom > scrollTop) {
          const delay = part.motion.waiting ? stagger++ * 90 : 0;
          part.motion.begin(time, delay);
          part.ink.begin(time, delay);
        }
        moving = part.motion.sample(time, width, live.current.reducedMotion) || moving;
        moving = part.ink.sample(time, live.current.reducedMotion) || moving;
        if (part.element.dataset.entryPhase !== part.motion.phase) part.element.dataset.entryPhase = part.motion.phase;
        const inkPhase = part.ink.phase;
        part.inkPhase = inkPhase;
        if (part.element.dataset.inkPhase !== inkPhase) part.element.dataset.inkPhase = inkPhase;
        if (previousOffset !== Math.round(part.motion.offset * 1000) || previousInk !== part.ink.revision) planner.invalidate('motion');
        if ((!part.motion.done && !part.motion.waiting) || inkPhase === 'entering' || inkPhase === 'paused') activeParts.add(part);
        else activeParts.delete(part);
      }
      const bend: BendSettings = streamBendSettings(width, height, variant, scrollTop), zone = bend.zone * height;
      if (variant === 'liquid-settle' || variant === 'liquid-live' || variant === 'liquid-live-before') {
        let motion = surfaceMotions.get(variant);
        if (!motion) {
          motion = new SettlingScrollNoiseMotion(live.current.motionSeed, variant !== 'liquid-settle', variant === 'liquid-live');
          surfaceMotions.set(variant, motion);
        }
        const sample = motion.sample(scrollTop, time, live.current.reducedMotion || document.hidden);
        bend.noisePhase = sample.phase;
        moving = sample.moving || moving;
      } else if (bend.perlin) {
        liquidNoise ??= new ScrollNoiseMotion(live.current.motionSeed);
        bend.noisePhase = liquidNoise.advance(scrollTop);
      }
      const plan = planner.frame({ scrollTop, width, height, reducedMotion: live.current.reducedMotion, variant,
        surfacePhase: Math.round((bend.noisePhase ?? 0) * 1e6), focus: activeElement, canvasReady: canvasOwnsGlyphs });
      if (!plan.surfaceChanged) return moving;
      if (!plan.sourceChanged && drawn) {
        const started = probe ? performance.now() : 0;
        glass?.draw(cachedRuns, width, height, live.current.reducedMotion, bend, plan.fontRevision, plan);
        if (probe) drawMs += performance.now() - started;
        drawn.settings = bend;
        return moving;
      }
      const runs = cachedRuns, hits = cachedHits;
      runs.length = 0; hits.length = 0;
      wordIndex.visible(scrollTop - 70, scrollTop + height + 70, visibleWords);
      frameWordsVisited = wordIndex.visited;
      nextWords.clear();
      for (const word of visibleWords) nextWords.add(word);
      for (const word of previousWords) {
        if (!nextWords.has(word)) {
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
        }
      }
      const oldWords = previousWords; previousWords = nextWords; nextWords = oldWords;
      for (const word of visibleWords) {
        const screenY = word.y - scrollTop;
        const projection = streamProjection({
          ...word, viewportWidth: width, viewportHeight: height,
          scrollTop, reducedMotion: live.current.reducedMotion,
        }, variant);
        const focused = word.element.contains(activeElement);
        const blur = focused || word.quiet ? 0 : projection.blur;
        const offset = word.part?.motion.offset || 0;
        const folded = !live.current.reducedMotion && !word.quiet &&
          (screenY - word.wordHeight * projection.scale / 2 < zone || screenY + word.wordHeight * projection.scale / 2 > height - zone);
        const progress = word.part && word.part.inkPhase !== 'settled' ? word.part.ink.progress(word.inkIndex, word.count, word.progress) : undefined;
        const inking = !live.current.reducedMotion && !!progress?.some(value => value < 1);
        word.element.toggleAttribute('data-flow-bent', folded);
        word.element.toggleAttribute('data-flow-ink', inking);
        const transform = offset ? `translateX(${offset.toFixed(3)}px) ${projection.transform}` : projection.transform;
        if (!word.quiet) {
          const run = word.run;
          run.x = width / 2 + (word.x - width / 2) * projection.scale + offset;
          run.y = screenY; run.scale = projection.scale; run.folded = folded;
          run.opacity = projection.opacity; run.blur = blur; run.fire = projection.fire;
          run.ink = inking ? progress : undefined;
          run.highlighted = focused || !!word.element.querySelector('[data-bend-hover]');
          runs.push(run);
          for (let i = 0; i < word.links.length; i++) {
            const link = word.links[i]!, hit = word.hits[i]!;
            hit.x = width / 2 + (link.x - width / 2) * projection.scale + offset;
            hit.y = screenY + (link.y - word.y) * projection.scale;
            hit.width = link.width * projection.scale; hit.height = link.height * projection.scale;
            hits.push(hit);
          }
        }
        // Invisible native glyphs retain their accessible buttons and layout;
        // only the canvas paints them. Updating their filters/transforms too
        // creates redundant paint and compositing work during fast scrolling.
        const canvasGlyph = canvasOwnsGlyphs && (folded || inking);
        const profile = canvasGlyph ? 'canvas' : `${transform}:${blur.toFixed(3)}:${projection.opacity.toFixed(3)}`;
        if (word.profile === profile) continue;
        word.profile = profile;
        word.element.style.transformOrigin = projection.origin;
        word.element.style.transform = canvasGlyph ? 'none' : transform;
        word.element.style.opacity = canvasGlyph ? '1' : String(projection.opacity);
        word.element.style.filter = canvasGlyph || !blur ? 'none' : `blur(${blur.toFixed(3)}px)`;
      }
      const started = probe ? performance.now() : 0;
      glass?.draw(runs, width, height, live.current.reducedMotion, bend, plan.fontRevision, plan);
      if (probe) drawMs += performance.now() - started;
      drawn = { settings: bend, hits };
      return moving;
    };

    const schedule = () => {
      if (!handle && !disposed) handle = requestAnimationFrame(tick);
    };
    const tick = (time: number) => {
      const started = probe ? performance.now() : 0;
      drawMs = 0;
      handle = 0;
      if (pendingMeasure) remeasure(pendingMeasure);
      const p = live.current;
      const playing = !p.paused && p.autoScroll !== false && !p.reducedMotion && !document.hidden && !!p.entries.length;
      const top = scrollMotion.frame(panel.scrollTop, time, playing,
        Math.max(panel.scrollTop, panel.scrollHeight - panel.clientHeight));
      if (playing) panel.scrollTop = top;
      // Keep native layout/scrolling, and compensate only the fraction which
      // the browser rounded away. Optical projection uses that same position.
      const remainder = scrollMotion.applied(panel.scrollTop);
      content.style.translate = remainder ? `0 ${-remainder}px` : '';
      if (playing) schedule();
      if (paint(time)) schedule();
      if (probe) {
        const cpuMs = performance.now() - started;
        probe({ time, cpuMs, totalWords: words.length, visibleWords: cachedRuns.length,
          indexedWordsVisited: frameWordsVisited, activeParts: activeParts.size, visibleParts: visibleParts.length,
          scrollTop: top, nativeScrollTop: panel.scrollTop, scrollRemainder: remainder,
          fastManualScroll,
          drawMs, sceneMs: cpuMs - drawMs, layout: { ...layoutProbe }, render: glass?.diagnostics });
      }
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
    const remeasure = (reason = 'content') => {
      const started = probe ? performance.now() : 0;
      pendingMeasure = null;
      // Materialize the previous layout's lazy finish boundary before content
      // moves or new paragraphs are inserted. This is layout work, not RAF work.
      partIndex.finishBefore(passedUntil, finishPart);
      passedUntil = scrollMotion.position(panel.scrollTop);
      planner.invalidate('layout');
      settledAll = false;
      width = content.clientWidth;
      const byElement = new Map<HTMLElement, Part>();
      parts = Array.from(content.querySelectorAll<HTMLElement>('[data-flow-entrance]')).map((element, order) => {
        let motion = motions.get(element);
        if (!motion) {
          motion = new EntranceMotion(Number(element.dataset.entryOrder) % 2 ? 1 : -1);
          motions.set(element, motion);
        }
        let ink = inks.get(element);
        if (!ink) { ink = new InkMotion(); inks.set(element, ink); }
        const { y } = positionOf(element);
        const part = partRecords.get(element) ?? { element, top: 0, bottom: 0, order, motion, ink, inkPhase: ink.phase };
        part.top = y - element.offsetHeight / 2; part.bottom = y + element.offsetHeight / 2; part.order = order;
        byElement.set(element, part);
        return part;
      });
      partRecords.clear(); activeParts.clear();
      for (const part of parts) partRecords.set(part.element, part);
      words = Array.from(content.querySelectorAll<HTMLElement>('[data-flow-optic]')).map((element, order) => {
        element.style.removeProperty('visibility');
        // offset geometry ignores our transforms and remains stable while paused.
        const { x, y } = positionOf(element);
        // x is panel-relative; its optical axis is the viewport center.
        const style = getComputedStyle(element);
        const text = element.textContent || '';
        const previous = wordRecords.get(element);
        const run = previous?.run ?? { id: ++nextWordId, text: '', font: '', spacing: '', color: '', x, y, scale: 1 };
        const links = Array.from(element.querySelectorAll<HTMLElement>('button')).map(button => ({
          element: button, ...positionOf(button), width: button.offsetWidth, height: button.offsetHeight,
        }));
        const word: Word = Object.assign(previous ?? {}, { element, x, y, top: y, bottom: y, order,
          wordWidth: element.offsetWidth, profile: '', count: Array.from(text).length,
          wordHeight: element.offsetHeight, inkIndex: 0,
          text, font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          spacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
          color: style.color, quiet: element.dataset.flowOptic === 'quiet',
          links, hits: links.map(link => ({ ...link })), run, progress: previous?.progress ?? [],
          part: byElement.get(element.closest<HTMLElement>('[data-flow-entrance]')!) });
        Object.assign(run, { text, font: word.font, spacing: word.spacing, color: word.color, width: word.wordWidth,
          rowId: Math.round(y * 2), surface: word.part?.element.dataset.flowEntrance as OpticalRun['surface'] || 'fullText' });
        wordRecords.set(element, word);
        return word;
      });
      const textByPart = new Map<Part, { text: string; count: number }>();
      for (const word of words) if (word.part) {
        const paragraph = textByPart.get(word.part) ?? { text: '', count: 0 };
        word.inkIndex = paragraph.count;
        paragraph.text += word.text; paragraph.count += word.count;
        textByPart.set(word.part, paragraph);
      }
      for (const part of parts) {
        part.ink.sync(textByPart.get(part)?.text || ''); part.inkPhase = part.ink.phase;
        if (part.element.dataset.entryPhase !== part.motion.phase) part.element.dataset.entryPhase = part.motion.phase;
        if (part.element.dataset.inkPhase !== part.inkPhase) part.element.dataset.inkPhase = part.inkPhase;
        if ((!part.motion.done && !part.motion.waiting) || part.inkPhase === 'entering' || part.inkPhase === 'paused') activeParts.add(part);
      }
      partIndex.setLayout(parts); wordIndex.setLayout(words);
      const entriesByKey = new Map(live.current.entries.map(entry => [entryKey(entry), entry]));
      articleScene.current.setLayout(Array.from(content.querySelectorAll<HTMLElement>('[data-flow-frame]')).flatMap((element, order) => {
        const entry = entriesByKey.get(element.dataset.streamKey!);
        const { y } = positionOf(element);
        return entry ? [{ top: y - element.offsetHeight / 2, bottom: y + element.offsetHeight / 2, order, entry }] : [];
      }));
      width = panel.clientWidth;
      measuredSize = layoutSize();
      if (probe) {
        layoutProbe.count++; layoutProbe.lastMs = performance.now() - started;
        layoutProbe.totalMs += layoutProbe.lastMs; layoutProbe.reason = reason;
      }
      schedule();
    };
    measure.current = remeasure;
    // Font and size notifications can describe the same layout in one frame.
    // Keep content/restoration measurement synchronous, and fold notifications
    // into the next paint without repeating the full history traversal.
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (layoutSize() !== measuredSize) { pendingMeasure ??= 'resize'; schedule(); }
    }) : null;
    resize?.observe(content);
    resize?.observe(panel);
    const fontChanged = () => { planner.invalidate('font'); pendingMeasure = 'font'; schedule(); };
    document.fonts?.addEventListener('loadingdone', fontChanged);
    // Verified FontFaces are loaded before document.fonts.add(), so adding a
    // late ancestor's face need not emit loadingdone or change line geometry.
    // The installed family list is the typography contract used by native text.
    let classicFamily = document.documentElement.style.getPropertyValue('--flow-classic-family');
    const fontStyles = new MutationObserver(() => {
      const next = document.documentElement.style.getPropertyValue('--flow-classic-family');
      if (next !== classicFamily) { classicFamily = next; fontChanged(); }
    });
    fontStyles.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const onFocus = () => { entrance.current.pause(); };
    panel.addEventListener('focusin', onFocus);
    panel.addEventListener('focusout', schedule);
    document.addEventListener('visibilitychange', schedule);
    if (glassRef.current) glass = new StreamGlass(glassRef.current, () => { planner.invalidate('restore'); schedule(); }, !!probe);
    const targetAt = (clientX: number, clientY: number) => {
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
    };
    opticalHit.current = targetAt;
    const unbindBend = bindBendInteraction(panel, targetAt, () => { planner.invalidate('interaction'); schedule(); });
    remeasure('mount');
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      resize?.disconnect();
      fontStyles.disconnect();
      document.fonts?.removeEventListener('loadingdone', fontChanged);
      panel.removeEventListener('focusin', onFocus);
      panel.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', schedule);
      glass?.destroy();
      unbindBend();
      content.style.translate = '';
      opticalHit.current = () => undefined;
      for (const { element } of words) {
        for (const name of ['transform', 'transform-origin', 'filter', 'opacity', 'visibility']) element.style.removeProperty(name);
        element.removeAttribute('data-flow-bent');
        element.removeAttribute('data-flow-ink');
      }
      optics.current = () => {};
      measure.current = () => {};
      entrance.current = { pause: () => {}, resume: () => {} };
    };
  }, [scrollMotion, manualScroll]);

  useEffect(() => {
    if (previousFlow.current.paused !== props.paused) {
      // Restoring a saved paused reading position is not a user interruption.
      if (props.paused && previousFlow.current.revision === props.restore.revision) entrance.current.pause();
      else entrance.current.resume();
    }
    previousFlow.current = { paused: props.paused, revision: props.restore.revision };
    optics.current();
  }, [props.paused, props.reducedMotion, props.restore.revision, props.motionVariant]);
  const count = props.entries.length;
  useEffect(() => {
    if (count) live.current.onVisualReady();
  }, [count]);

  const pause = () => {
    intended.current = false;
    manualScroll.reset();
    entrance.current.pause();
    if (panelRef.current) props.onScroll(scrollMotion.position(panelRef.current.scrollTop));
    props.onPause();
  };
  const cancelMeaningPress = () => {
    if (meaningPress.current) window.clearTimeout(meaningPress.current.timer);
    meaningPress.current = null;
  };
  const showMeaning = (entry: StreamEntry, resume = !props.paused && !props.reducedMotion, trigger: HTMLElement | null = null) => {
    if (!entry.frame.meaning) return;
    cancelMeaningPress();
    if (meaningFor === entryKey(entry)) return;
    meaningResume.current = resume;
    meaningTrigger.current = trigger;
    pause();
    props.onRead(entry);
    setMeaningFor(entryKey(entry));
  };
  const closeMeaning = () => {
    setMeaningFor(null);
    const resume = meaningResume.current;
    meaningResume.current = false;
    if (resume && !live.current.reducedMotion) {
      intended.current = true;
      entrance.current.resume();
      live.current.onResume?.();
    }
  };
  const meaningAt = (target: EventTarget | null) => {
    const article = target instanceof Element ? target.closest('[data-flow-heading]')?.closest<HTMLElement>('[data-stream-key]') : null;
    return article ? props.entries.find(entry => entryKey(entry) === article.dataset.streamKey && !!entry.frame.meaning) : undefined;
  };
  const resumeFromInput = (target: EventTarget | null) => {
    cancelMeaningPress();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && (panelRef.current?.contains(selection.anchorNode) || panelRef.current?.contains(selection.focusNode))) return;
    if (target instanceof Element && target.closest('textarea, input, select, [contenteditable="true"]')) return;
    if (panelRef.current) manualScroll.input(scrollMotion.position(panelRef.current.scrollTop), performance.now());
    intended.current = true;
    if (!props.onResume) { entrance.current.pause(); props.onPause(); return; }
    if (props.reducedMotion) return;
    entrance.current.resume();
    props.onResume();
  };
  function onScroll() {
    const panel = panelRef.current;
    if (!panel) return;
    if (meaningPress.current && Math.abs(scrollMotion.position(panel.scrollTop) - meaningPress.current.top) > 6) cancelMeaningPress();
    optics.current();
    const top = scrollMotion.position(panel.scrollTop);
    props.onScroll(top);
    const edge = top + panel.clientHeight * .38;
    const entry = articleScene.current.atOrBefore(edge)?.entry;
    const focused = document.activeElement;
    const editing = focused instanceof Element && panel.contains(focused) && focused.matches('textarea, input');
    if (entry && entryKey(entry) !== props.activeKey && !editing && !props.sourceOpen && !notesFor && !menuOpen && !meaningFor) props.onRead(entry);
    if ((!intended.current && props.paused) || editing || props.pending || !props.canContinue) return;
    const tail = articleScene.current.last;
    if (!tail) return;
    const cursor = props.entries.at(-1);
    const key = cursor ? entryKey(cursor) : '';
    const gap = tail.bottom - top - panel.clientHeight * .82;
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
  const meaningEntry = contentEntries.find(({ entry }) => entryKey(entry) === meaningFor);
  const menuEntry = props.entries.find(entry => entryKey(entry) === (menuFor || props.activeKey)) || props.entries[0];
  const menuCurrent = !!menuEntry && entryKey(menuEntry) === props.activeKey;

  return <section className={styles.stream} aria-label="连续经文流" data-flow-stream data-motion-variant={props.motionVariant || 'liquid-live'} data-paused={props.paused} data-pending={props.pending}>
    <canvas ref={glassRef} className={styles.streamGlass} data-flow-glass aria-hidden="true" />
    <div ref={panelRef} className={styles.streamViewport} tabIndex={0} aria-label="经文阅读" data-flow-viewport
      aria-description={`${props.onResume ? '点击停驻阅读，滚轮、上下滑动或翻页键继续流动。' : ''}向左滑动打开阅读选项。长按经文或按 Shift+F10 查看释义。`}
      onWheel={event => { if (!event.ctrlKey && event.deltaY) resumeFromInput(event.target); }}
      onTouchMove={event => {
        if (event.touches.length !== 1) return;
        const start = pointer.current, touch = event.touches[0];
        if (!touch) return;
        if (start && Math.abs(touch.clientX - start.x) > 6 && Math.abs(touch.clientX - start.x) > Math.abs(touch.clientY - start.y) * 1.4) return;
        resumeFromInput(event.target);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || event.isPrimary === false) return;
        cancelMeaningPress();
        suppressPressClick.current = false;
        if (event.target instanceof Element && event.target.closest('textarea, input, select, [contenteditable="true"]')) {
          pointer.current = null;
          pause();
          return;
        }
        const hit = opticalHit.current(event.clientX, event.clientY);
        const target = hit === undefined ? event.target : hit;
        const article = target instanceof Element ? target.closest<HTMLElement>('[data-stream-key]') : null;
        const resume = !props.paused && !props.reducedMotion;
        pointer.current = { x: event.clientX, y: event.clientY, moved: false, resume, key: article?.dataset.streamKey || props.activeKey };
        const entry = meaningAt(target);
        if (entry) {
          const timer = window.setTimeout(() => {
            const press = meaningPress.current;
            if (!press || pointer.current?.moved) return;
            const latest = live.current.entries.find(entry => entryKey(entry) === press.key);
            if (!latest) return;
            suppressPressClick.current = true;
            showMeaning(latest, press.resume, press.trigger);
          }, 450);
          const trigger = target instanceof Element ? target.closest<HTMLElement>('button') : null;
          meaningPress.current = { timer, key: entryKey(entry), resume, trigger, top: scrollMotion.position(event.currentTarget.scrollTop) };
        }
        pause();
      }}
      onPointerMove={event => {
        if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 6) {
          const dx = event.clientX - pointer.current.x, dy = event.clientY - pointer.current.y;
          if (Math.abs(dy) > Math.abs(dx) * 1.4 && panelRef.current) manualScroll.input(scrollMotion.position(panelRef.current.scrollTop), performance.now());
          pointer.current.moved = true;
          cancelMeaningPress();
        }
      }}
      onPointerUp={event => {
        cancelMeaningPress();
        const start = pointer.current;
        if (!start || suppressPressClick.current) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (dx > -36 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        start.moved = true;
        suppressPressClick.current = true;
        menuResume.current = start.resume;
        setMenuFor(start.key);
        setMenuOpen(true);
      }}
      onPointerLeave={cancelMeaningPress}
      onPointerCancel={() => { cancelMeaningPress(); pointer.current = null; suppressPressClick.current = false; }}
      onClickCapture={event => {
        // Touch browsers may dispatch the click after pointerup. Keep this
        // press consumed until its click or the next pointer sequence; native
        // keyboard activation has detail 0 and remains available.
        if ((suppressPressClick.current || pointer.current?.moved) && event.detail !== 0) {
          event.preventDefault(); event.stopPropagation(); pointer.current = null;
        }
        suppressPressClick.current = false;
      }}
      onContextMenu={event => {
        const entry = meaningAt(event.target);
        if (entry) { event.preventDefault(); showMeaning(entry, meaningPress.current?.resume ?? (!props.paused && !props.reducedMotion)); }
      }}
      onClick={event => {
        if (pointer.current?.moved) { pointer.current = null; return; }
        pointer.current = null;
        if (event.target instanceof Element && !event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) pause();
      }}
      onScroll={onScroll}
      onKeyDown={event => {
        if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
          const entry = meaningAt(event.target);
          if (entry) { event.preventDefault(); event.stopPropagation(); showMeaning(entry); return; }
        }
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const editing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]');
        const activating = event.key === ' ' && event.target instanceof Element && event.target.closest('button, a');
        if (!editing && !activating && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) resumeFromInput(event.target);
        else pause();
      }}>
      <div ref={contentRef} className={styles.streamContent}>
        {contentEntries.map(({ entry, select }, entryIndex) => {
          const key = entryKey(entry), item = entry.frame, current = key === props.activeKey;
          const connecting = props.connecting?.pathId && props.connecting.pathId !== entry.pathId ? null : props.connecting;
          return <article key={key} data-flow-frame={item.id} data-flow-path={entry.pathId} data-stream-key={key} data-flow-ready={item.ready !== false}
            className={styles.streamNode} aria-label={`${item.source} · ${item.chapterLabel}`}>
            <blockquote className={styles.streamQuote} data-flow-heading data-flow-entrance="quote"
              data-entry-order={entryIndex * 3} data-entry-side={entryIndex % 2 ? 'right' : 'left'}>
              <RetainedLinkedText optical frame={item} surface="quote" onSelect={select} connecting={connecting} />
            </blockquote>
            {(item.ready !== false || item.settled?.reflection) && item.reflection && <div className={styles.streamReflection} data-flow-surface="reflection"
              aria-label="此刻回响" data-flow-entrance="reflection" data-entry-order={entryIndex * 3 + (item.meaning ? 2 : 1)}
              data-entry-side={(entryIndex + (item.meaning ? 0 : 1)) % 2 ? 'right' : 'left'}>
              <p><RetainedLinkedText optical frame={item} surface="reflection" onSelect={select} connecting={connecting} /></p>
            </div>}
            {current && props.sourceOpen && <div className={styles.streamSourceText} data-flow-source>
              <p className={styles.sectionLabel}>{item.source} · {item.chapterLabel} · 完整原文</p>
              <p className={styles.fullSource}><RetainedLinkedText optical frame={item} surface="fullText" onSelect={select} connecting={connecting} /></p>
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
    <FlowMenu {...props.navigation} open={menuOpen} onOpenChange={open => {
      if (open) { menuResume.current = !props.paused && !props.reducedMotion; setMenuFor(props.activeKey); }
      else setMenuFor(null);
      setMenuOpen(open);
    }} onOpen={() => { pause(); if (menuEntry) props.onRead(menuEntry); }} reading={menuEntry ? {
      key: entryKey(menuEntry), source: `${menuEntry.frame.source} · ${menuEntry.frame.chapterLabel}`,
      sourceOpen: menuCurrent && props.sourceOpen, bookmarked: props.bookmarkKeys.has(quoteKey(menuEntry.frame)),
      notesOpen: menuCurrent && (notesFor === entryKey(menuEntry) || notesFor === menuEntry.frame.id), noteCount: menuCurrent ? props.notes.length : 0,
      onMeaning: menuEntry.frame.meaning ? () => showMeaning(menuEntry, menuResume.current) : undefined,
      onSource: () => { props.onRead(menuEntry); props.onToggleSource(); },
      onBookmark: () => { props.onRead(menuEntry); props.onBookmark(); },
      onNotes: () => { props.onRead(menuEntry); setNotesFor(notesFor === entryKey(menuEntry) || notesFor === menuEntry.frame.id ? null : entryKey(menuEntry)); },
    } : undefined} />
    {meaningEntry?.entry.frame.meaning && <MeaningPopover source={`${meaningEntry.entry.frame.source} · ${meaningEntry.entry.frame.chapterLabel}`} onClose={closeMeaning} returnFocus={meaningTrigger.current}>
      <RetainedLinkedText frame={meaningEntry.entry.frame} surface="meaning" onSelect={meaningEntry.select}
        connecting={props.connecting?.pathId && props.connecting.pathId !== meaningEntry.entry.pathId ? null : props.connecting} />
    </MeaningPopover>}
  </section>;
}
