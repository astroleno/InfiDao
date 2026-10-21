import type { FlowAnchor, FlowFrame, FlowSelection } from '../flow/contracts';
import type { GraphEdge, GraphNode, SenseNode } from './graph';
import type { FlowPathRecord } from './storage';
import type { SavedTarget } from './library';

type Address = { pathId: string; frameId: string };
type Projection = { nodes: GraphNode[]; edges: GraphEdge[] };
export const passageIdentity = (frame: Pick<FlowFrame, 'sourceId' | 'corpusVersion' | 'textHash' | 'quoteStart' | 'quoteEnd'>) =>
  'passage:' + JSON.stringify([frame.sourceId, frame.corpusVersion, frame.textHash, frame.quoteStart, frame.quoteEnd]);
const clean = (text: string) => text.normalize('NFKC').trim().replace(/\s+/gu, ' ');

/** Recover the exact legacy range and the old lexical planner's own fields. */
export function legacyReadingContext(frame: FlowFrame, anchorId: string, label: string, focus: string) {
  const match = /^(text|meaning|reflection):(\d+):(\d+)$/.exec(anchorId);
  if (!match) return null;
  const surface = match[1] === 'text' ? undefined : match[1] as 'meaning' | 'reflection';
  const text = surface ? frame[surface] : frame.fullText;
  const start = Number(match[2]), end = Number(match[3]);
  if (!text || start < 0 || end <= start || text.slice(start, end) !== label) return null;
  const selection: FlowSelection = { start, end, textHash: frame.textHash, corpusVersion: frame.corpusVersion,
    ...(surface ? { surface, surfaceText: text } : {}) };
  const place = surface === 'meaning' ? '的现代释义中' : surface === 'reflection' ? '的生成联系中' : '原文此处';
  const prefixes = [`「${label}」在《${frame.source}》${place}：`, ...(!surface ? [`「${label}」在原文中：`] : [])];
  const prefix = prefixes.find(value => focus.startsWith(value));
  const stored = prefix ? focus.slice(prefix.length) : '';
  const divider = stored.indexOf('；');
  return { selection, definition: divider > 0 ? stored.slice(0, divider).trim() : '',
    explanation: divider > 0 ? stored.slice(divider + 1).trim() : '' };
}

function association(kind: 'sense' | 'topic', from: string, to: string, address: Address,
  label: string, explanation: string, createdAt: number, updatedAt: number): GraphEdge {
  return { id: `${kind}:` + JSON.stringify([from, to]), fromNodeId: from, toNodeId: to, kind,
    selectionKey: kind, label, seed: '', focus: '', source: address, target: address,
    meaning: '', reflection: '', ready: true, relationType: 'related', explanation, createdAt, updatedAt };
}

export function topicProjection(from: string, address: Address, labels: string[], label: string,
  explanation: string, createdAt: number, updatedAt: number): Projection & { topicIds: string[] } {
  const terms = [...new Set(labels.filter(term => typeof term === 'string').map(clean).filter(term => term.length > 0 && term.length <= 20))].slice(0, 6);
  const nodes: GraphNode[] = terms.map(term => ({ id: 'topic:' + term, kind: 'topic', label: term, createdAt }));
  return { nodes, edges: nodes.map(node => association('topic', from, node.id, address, label, explanation, createdAt, updatedAt)),
    topicIds: nodes.map(node => node.id) };
}

export function projectSelectedSense(frame: FlowFrame, passageId: string, address: Address, label: string,
  selection: FlowSelection | undefined, anchor: FlowAnchor | undefined, definition: string,
  createdAt: number, updatedAt: number): Projection & { senseId?: string } {
  const surface = selection ? selection.surface || 'quote' : anchor?.surface || 'reflection';
  const text = surface === 'quote' ? frame.fullText : frame[surface];
  const legacyStart = anchor && text.indexOf(label) === text.lastIndexOf(label) ? text.indexOf(label) : -1;
  const start = selection?.start ?? (anchor?.start !== undefined ? anchor.start + (surface === 'quote' ? frame.quoteStart : 0) : legacyStart);
  const end = selection?.end ?? (anchor?.end !== undefined ? anchor.end + (surface === 'quote' ? frame.quoteStart : 0) : legacyStart < 0 ? -1 : legacyStart + label.length);
  if (start < 0 || end <= start || end > text.length || !label || text.slice(start, end) !== label ||
    (selection?.surface && selection.surfaceText !== text)) return { nodes: [], edges: [] };
  // Identity includes the exact occurrence and explanation surface. A shared
  // spelling in a different quotation or a revised gloss is a different use.
  const id = 'sense:' + JSON.stringify([passageId, surface, surface === 'quote' ? '' : text, start, end]);
  const node: SenseNode = { id, kind: 'sense', label, definition: definition.trim(), passageId, surface,
    excerpt: text.slice(Math.max(0, start - 24), Math.min(text.length, end + 24)), createdAt };
  return { senseId: id, nodes: [node], edges: [association('sense', passageId, id, address, '此处义项', definition.trim(), createdAt, updatedAt)] };
}

export function projectFrameKnowledge(frame: FlowFrame, passageId: string, address: Address, createdAt: number, updatedAt: number): Projection {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [];
  const add = (part: Projection) => { nodes.push(...part.nodes); edges.push(...part.edges); };
  if (frame.ready === false) return { nodes, edges };
  for (const anchor of frame.anchors) {
    const sense = projectSelectedSense(frame, passageId, address, anchor.label, undefined, anchor, anchor.sense || '', createdAt, updatedAt);
    add(sense);
    if (sense.senseId) add(topicProjection(sense.senseId, address, anchor.topics || anchor.terms || [],
      anchor.topics ? '涉及主题' : '关联线索', anchor.direction || '', createdAt, updatedAt));
  }
  if (frame.knowledge) add(topicProjection(passageId, address, frame.knowledge.topics, '涉及主题',
    frame.knowledge.relation.description, createdAt, updatedAt));
  return { nodes, edges };
}

export const relationLabels = { related: '关联', similar: '相近', contrast: '对照', elaboration: '展开', application: '应用', cause: '因果' } as const;
export const knowledgeKinds = { passage: '经句', sense: '义项', topic: '主题', thought: '一念' } as const;
export type KnowledgeEntry = { node: GraphNode; label: string; detail: string; source: string; original?: SavedTarget };
export type KnowledgeConnection = { id: string; from: string; to: string; label: string; description: string };
export type KnowledgeLibrary = { entries: KnowledgeEntry[]; connections: KnowledgeConnection[] };

/** All navigation resolves against a saved, matching canonical passage. */
export function knowledgeLibrary(nodes: GraphNode[], edges: GraphEdge[], paths: FlowPathRecord[]): KnowledgeLibrary {
  const originals = new Map<string, SavedTarget>();
  for (const path of paths) for (const frame of path.chain.frames as FlowFrame[]) {
    if (typeof frame.fullText !== 'string' || frame.fullText.slice(frame.quoteStart, frame.quoteEnd) !== frame.quote) continue;
    const key = passageIdentity(frame);
    if (!originals.has(key)) originals.set(key, { pathId: path.pathId, frameId: frame.id, source: true });
  }
  const byId = new Map(nodes.map(node => [node.id, node]));
  const entries: KnowledgeEntry[] = nodes.map(node => {
    const passage = node.kind === 'passage' ? node : node.kind === 'sense' ? byId.get(node.passageId) : undefined;
    const original = passage?.kind === 'passage' ? originals.get(passage.id) : undefined;
    return { node, label: node.kind === 'passage' ? node.quote : node.kind === 'thought' ? node.text : node.label,
      detail: node.kind === 'sense' ? node.definition : '',
      source: passage?.kind === 'passage' ? `${passage.source} · ${passage.chapterLabel}${node.kind === 'sense' ? ` · ${node.surface === 'quote' ? '原文' : node.surface === 'meaning' ? '释义' : '回响'}` : ''}` : '',
      ...(original ? { original } : {}) };
  }).sort((a, b) => b.node.createdAt - a.node.createdAt || a.label.localeCompare(b.label, 'zh-CN'));
  const connections = edges.filter(edge => edge.ready && byId.has(edge.fromNodeId) && byId.has(edge.toNodeId)).map(edge => ({
    id: edge.id, from: edge.fromNodeId, to: edge.toNodeId,
    label: edge.kind === 'sense' || edge.kind === 'topic' ? edge.label :
      `${relationLabels[edge.relationType || 'related']}${edge.kind === 'word' ? ` · 沿「${edge.label}」` : edge.kind === 'thought' ? ' · 一念' : ''}`,
    description: edge.explanation || edge.reflection || (edge.kind === 'thought' ? edge.seed : ''),
  }));
  return { entries, connections };
}
