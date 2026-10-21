import type { FlowFrame, FlowRelationType, FlowSelection } from '../flow/contracts';
import { createPathId, readingStorage, type createReadingStorage, type FlowPathRecord } from './storage';
import { projectFrameKnowledge, projectSelectedSense, topicProjection, knowledgeLibrary, passageIdentity, legacyReadingContext } from './knowledge';

type Address = { pathId: string; frameId: string };
export type PassageNode = Pick<FlowFrame, 'sourceId' | 'corpusVersion' | 'textHash' | 'quoteStart' | 'quoteEnd' | 'quote' | 'source' | 'chapterLabel'> & {
  id: string; kind: 'passage'; createdAt: number;
};
type ThoughtNode = { id: string; kind: 'thought'; text: string; createdAt: number };
export type SenseNode = { id: string; kind: 'sense'; label: string; definition: string; passageId: string;
  surface: 'quote' | 'meaning' | 'reflection'; excerpt: string; createdAt: number };
export type TopicNode = { id: string; kind: 'topic'; label: string; createdAt: number };
export type GraphNode = PassageNode | ThoughtNode | SenseNode | TopicNode;
export type GraphEdge = {
  id: string; fromNodeId: string; toNodeId: string;
  kind: 'word' | 'continuation' | 'thought' | 'entry' | 'sense' | 'topic';
  selectionKey: string; label: string; seed: string; focus: string;
  selection?: FlowSelection; source?: Address; target: Address;
  meaning: string; reflection: string; ready: boolean; createdAt: number; updatedAt: number;
  relationType?: FlowRelationType; explanation?: string; senseId?: string; topicIds?: string[];
};
export type GraphVisit = {
  id: string; nodeId: string; pathId: string; frameId?: string;
  parentVisitId: string | null; edgeId?: string; createdAt: number;
};

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export const nodeId = passageIdentity;
export const visitId = (pathId: string, frameId: string) => JSON.stringify([pathId, frameId]);

function canonical(frame: FlowFrame) {
  return typeof frame.sourceId === 'string' && typeof frame.corpusVersion === 'string' && typeof frame.textHash === 'string' &&
    Number.isInteger(frame.quoteStart) && Number.isInteger(frame.quoteEnd) && frame.quoteEnd > frame.quoteStart &&
    typeof frame.fullText === 'string' && frame.fullText.slice(frame.quoteStart, frame.quoteEnd) === frame.quote;
}

/** Explanation words retain their exact surface text; equal spelling alone is not an equal meaning. */
function selectionKey(frame: FlowFrame, anchorId: string, selection?: FlowSelection) {
  if (anchorId.startsWith('next:')) return 'continuation';
  const anchor = frame.anchors.find(item => item.id === anchorId);
  const surface = selection?.surface || (anchor ? anchor.surface === 'quote' ? undefined : anchor.surface || 'reflection'
    : /^(meaning|reflection):/.exec(anchorId)?.[1] as 'meaning' | 'reflection' | undefined);
  const offset = surface ? 0 : frame.quoteStart;
  const range = selection ? `${surface || 'text'}:${selection.start}:${selection.end}`
    : anchor?.start !== undefined && anchor.end !== undefined ? `${surface || 'text'}:${offset + anchor.start}:${offset + anchor.end}` : anchorId;
  return JSON.stringify([range, surface ? selection?.surfaceText || frame[surface] : '']);
}

/**
 * Paths are durable view/session adapters. The graph owns content identity and
 * relations; a new path through an old edge is a new visit, not a new passage.
 */
export function createReadingGraph(storage: ReturnType<typeof createReadingStorage> = readingStorage) {
  let queue = Promise.resolve();
  let initialization: Promise<void> | null = null;
  let warning = false;
  const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.then(() => {}, () => {});
    return result;
  };
  const remember = (result: { persisted: boolean }) => { if (!result.persisted) warning = true; return result; };

  async function persist(records: FlowPathRecord[], known = new Map<string, FlowPathRecord>()) {
    const { mergeChain } = require('../../../shared/flow/controller');
    records = await Promise.all(records.map(async record => {
      const stored = await storage.loadPath(record.pathId);
      if (!stored || stored.chain.chainId !== record.chain.chainId) return record;
      const chain = mergeChain(stored.chain, record.chain);
      const merged: FlowPathRecord = { ...stored, ...record, chain,
        ...(stored.updatedAt > record.updatedAt ? { snapshot: stored.snapshot } : {}),
        updatedAt: Math.max(stored.updatedAt, record.updatedAt) };
      if (chain.frames.every((frame: FlowFrame) => frame.ready !== false)) {
        merged.completion = 'complete'; delete merged.recoveryError;
      }
      return merged;
    }));
    records.forEach(record => known.set(record.pathId, record));
    const nodes = new Map<string, GraphNode>(), edges = new Map<string, GraphEdge>(), visits = new Map<string, GraphVisit>();
    const absorb = (projection: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
      for (const node of projection.nodes) {
        const previous = nodes.get(node.id);
        nodes.set(node.id, node.kind === 'sense' && previous?.kind === 'sense' && !node.definition
          ? { ...node, definition: previous.definition } : node);
      }
      projection.edges.forEach(edge => edges.set(edge.id, edge));
    };
    const passage = async (frame: FlowFrame, createdAt: number) => {
      if (!canonical(frame)) return null;
      const id = nodeId(frame);
      if (!nodes.has(id)) {
        const previous = await storage.graphNode(id);
        nodes.set(id, previous || { id, kind: 'passage', sourceId: frame.sourceId, corpusVersion: frame.corpusVersion,
          textHash: frame.textHash, quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd, quote: frame.quote,
          source: frame.source, chapterLabel: frame.chapterLabel, createdAt });
      }
      return id;
    };
    for (const record of records) {
      const frames = record.chain.frames as FlowFrame[];
      const parent = record.parentPathId ? known.get(record.parentPathId) || await storage.loadPath(record.parentPathId) : null;
      const entry = record.parentEntry || record.chain.entry;
      const parentFrame = parent?.chain.frames.find((frame: FlowFrame) => frame.id === entry?.fromFrameId) as FlowFrame | undefined;
      let previousNode = parentFrame ? await passage(parentFrame, parent!.createdAt) : null;
      let previousVisit = parentFrame ? visitId(parent!.pathId, parentFrame.id) : null;
      const thought = entry?.thought || (!parent && record.chain.seedOrigin === 'user' ? record.chain.seed?.trim() : '');
      if (thought) {
        const id = 'thought:' + record.pathId;
        nodes.set(id, { id, kind: 'thought', text: thought, createdAt: record.createdAt });
        const incoming = previousNode ? 'thought-entry:' + record.pathId : undefined;
        if (incoming) edges.set(incoming, { id: incoming, fromNodeId: previousNode!, toNodeId: id, kind: 'thought',
          selectionKey: 'thought', label: '添一念', seed: thought, focus: record.chain.focus || '',
          source: { pathId: parent!.pathId, frameId: parentFrame!.id }, target: { pathId: record.pathId, frameId: '' },
          meaning: '', reflection: '', ready: true, createdAt: record.createdAt, updatedAt: record.updatedAt });
        visits.set(id, { id, nodeId: id, pathId: record.pathId, parentVisitId: previousVisit,
          ...(incoming ? { edgeId: incoming } : {}), createdAt: record.createdAt });
        previousNode = id; previousVisit = id;
      }
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        if (!frame) continue;
        const id = await passage(frame, record.createdAt);
        if (!id) continue;
        if (frame.ready !== false) absorb(projectFrameKnowledge(frame, id, { pathId: record.pathId, frameId: frame.id }, record.createdAt, record.updatedAt));
        let edgeId: string | undefined;
        const sourceFrame = index ? frames[index - 1] : parentFrame;
        const sourcePathId = index ? record.pathId : parent?.pathId;
        if (previousNode) {
          const reuseId = index === 0 ? record.graph?.edgeId : record.graph ? 'edge:' + visitId(record.graph.originPathId, frame.id) : undefined;
          const reused = reuseId ? await storage.graphEdge(reuseId) : null;
          if (reused?.fromNodeId === previousNode && reused.toNodeId === id) edgeId = reused.id;
          else {
            edgeId = 'edge:' + visitId(record.pathId, frame.id);
            const kind = index || entry?.anchorId?.startsWith('next:') ? 'continuation' : thought ? 'thought' : entry ? 'word' : 'entry';
            const key = kind === 'word' && sourceFrame ? selectionKey(sourceFrame, entry.anchorId, entry.selection) : kind;
            const anchor = kind === 'word' && sourceFrame ? sourceFrame.anchors.find(item => selectionKey(sourceFrame, item.id) === key) : undefined;
            const source = sourceFrame && sourcePathId ? { pathId: sourcePathId, frameId: sourceFrame.id } : undefined;
            const target = { pathId: record.pathId, frameId: frame.id };
            const legacy = kind === 'word' && sourceFrame && !entry.selection
              ? legacyReadingContext(sourceFrame, entry.anchorId, entry.label, record.chain.focus || '') : null;
            const topicTerms = frame.knowledge?.topics || anchor?.topics || anchor?.terms || (legacy ? [entry.label] : []);
            let senseId: string | undefined;
            if (kind === 'word' && sourceFrame && source && frame.ready !== false) {
              const selected = projectSelectedSense(sourceFrame, previousNode, source, entry.label, entry.selection || legacy?.selection, anchor,
                frame.knowledge?.sense || anchor?.sense || legacy?.definition || '', record.createdAt, record.updatedAt);
              senseId = selected.senseId;
              absorb(selected);
            }
            const topics = frame.ready === false ? { nodes: [], edges: [], topicIds: [] } : topicProjection(id, target, topicTerms,
              legacy && !frame.knowledge && !anchor ? '阅读角度' : '本次阅读主题', frame.knowledge?.relation.description || anchor?.direction || frame.reflection, record.createdAt, record.updatedAt);
            absorb(topics);
            if (senseId && source) absorb(topicProjection(senseId, source, topicTerms, '涉及主题', anchor?.direction || '', record.createdAt, record.updatedAt));
            edges.set(edgeId, { id: edgeId, fromNodeId: previousNode, toNodeId: id, kind,
              selectionKey: key, label: index ? '沿此意继续' : entry?.label || '此刻的一念',
              seed: record.chain.seed || '', focus: index ? record.chain.focus || '' : parent?.chain.focus || '',
              ...(entry?.selection && !index ? { selection: copy(entry.selection) } : {}),
              ...((index > 0 || !thought) && sourceFrame && sourcePathId ? { source: { pathId: sourcePathId, frameId: sourceFrame.id } } : {}),
              target, meaning: frame.meaning, reflection: frame.reflection,
              relationType: frame.knowledge?.relation.type || anchor?.relationType || 'related',
              explanation: frame.knowledge?.relation.description || anchor?.direction || frame.reflection,
              ...(senseId ? { senseId } : {}), topicIds: topics.topicIds,
              ready: frame.ready !== false, createdAt: record.createdAt, updatedAt: record.updatedAt });
          }
        }
        const visit = visitId(record.pathId, frame.id);
        visits.set(visit, { id: visit, nodeId: id, pathId: record.pathId, frameId: frame.id,
          parentVisitId: previousVisit, ...(edgeId ? { edgeId } : {}), createdAt: record.createdAt });
        previousNode = id; previousVisit = visit;
      }
    }
    for (const [id, node] of nodes) if (node.kind === 'sense' || node.kind === 'topic') {
      const previous = await storage.graphNode(id);
      if (previous?.kind === node.kind) nodes.set(id, { ...node, createdAt: Math.min(node.createdAt, previous.createdAt),
        ...(node.kind === 'sense' && previous.kind === 'sense' && !node.definition ? { definition: previous.definition } : {}) });
    }
    for (const [id, edge] of edges) if (edge.kind === 'sense' && !edge.explanation) {
      const sense = nodes.get(edge.toNodeId);
      if (sense?.kind === 'sense') edges.set(id, { ...edge, explanation: sense.definition });
    }
    return remember(await storage.commitGraph({ paths: records, nodes: [...nodes.values()], edges: [...edges.values()], visits: [...visits.values()] }));
  }

  function initialize() {
    if (!initialization) initialization = serialize(async () => {
      if (await storage.graphVersion() === 4) return;
      const paths = await storage.listPaths();
      const known = new Map(paths.map(record => [record.pathId, record]));
      let persisted = true;
      // Bounded transactions keep large existing libraries responsive. Every
      // path remains readable throughout the additive migration.
      for (let start = 0; start < paths.length; start += 16) {
        const result = await persist(paths.slice(start, start + 16), known);
        persisted = result.persisted && persisted;
      }
      if (persisted) remember(await storage.markGraphVersion());
    }).catch(error => { initialization = null; throw error; });
    return initialization;
  }

  async function put(record: FlowPathRecord) {
    await initialize();
    return serialize(() => persist([copy(record)]));
  }
  async function commitBranch(parent: FlowPathRecord, child: FlowPathRecord) {
    await initialize();
    return serialize(() => persist([copy(parent), copy(child)]));
  }

  async function child(parentPathId: string, fromFrameId: string, anchorId: string, selection?: FlowSelection) {
    await initialize();
    return serialize(async () => {
      const parent = await storage.loadPath(parentPathId);
      const from = parent?.chain.frames.find((frame: FlowFrame) => frame.id === fromFrameId) as FlowFrame | undefined;
      if (!parent || !from || !canonical(from)) return null;
      const key = selectionKey(from, anchorId, selection), seed = parent.chain.seed || '';
      const candidates = (await storage.graphEdgesFrom(nodeId(from))).filter(edge => ['word', 'continuation'].includes(edge.kind) && edge.ready && edge.selectionKey === key &&
        edge.seed === seed && (edge.kind !== 'continuation' || edge.focus === parent.chain.focus))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const choiceKey = JSON.stringify([nodeId(from), key, seed]);
      const previous = await storage.graphChoice(choiceKey);
      const after = candidates.findIndex(edge => edge.id === previous);
      for (let offset = 1; offset <= candidates.length; offset++) {
        const edge = candidates[(after + offset) % candidates.length];
        if (!edge) continue;
        const target = await storage.loadPath(edge.target.pathId);
        const index = target?.chain.frames.findIndex((frame: FlowFrame) => frame.id === edge.target.frameId) ?? -1;
        if (!target || index < 0) continue;
        const frames = (target.chain.frames as FlowFrame[]).slice(index);
        if (!frames[0] || frames.some(frame => frame.ready === false) || nodeId(frames[0]) !== edge.toNodeId) continue;
        const now = Date.now();
        const record: FlowPathRecord = { pathId: createPathId(), chain: { ...copy(target.chain), frames: copy(frames) },
          snapshot: copy(parent.snapshot), parentPathId, sourceLabel: edge.kind === 'continuation' ? '沿此意继续' : `沿「${edge.label}」`,
          parentEntry: { fromFrameId, anchorId, label: edge.label, ...(selection ? { selection: copy(selection) } : {}) },
          graph: { edgeId: edge.id, originPathId: target.graph?.originPathId || target.pathId },
          completion: 'complete', createdAt: now, updatedAt: now };
        await persist([record]);
        remember(await storage.chooseGraphEdge(choiceKey, edge.id));
        return record;
      }
      return null;
    });
  }

  async function library() {
    await initialize();
    return serialize(async () => knowledgeLibrary(await storage.listGraphNodes(), await storage.listGraphEdges(), await storage.listPaths()));
  }

  return { initialize, put, commitBranch, child, library, get: storage.loadPath,
    latest: storage.latest, activate: storage.activate, status: () => ({ persisted: !warning }) };
}

export const readingGraph = createReadingGraph();
