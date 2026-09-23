import type { FlowAnchor, FlowFrame } from './contracts';

export function anchoredSpans(text: string, anchors: FlowAnchor[]) {
  const ranges = anchors.map(anchor => ({ anchor, at: text.indexOf(anchor.label) }))
    .filter(item => item.at >= 0).sort((a, b) => a.at - b.at || b.anchor.label.length - a.anchor.label.length);
  const spans: FlowFrame['reflectionSpans'] = [], accepted: FlowAnchor[] = [];
  let cursor = 0;
  for (const { anchor, at } of ranges) {
    if (at < cursor) continue;
    if (at > cursor) spans.push({ text: text.slice(cursor, at) });
    spans.push({ text: anchor.label, anchorId: anchor.id });
    cursor = at + anchor.label.length;
    accepted.push({ ...anchor, start: at, end: cursor });
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return { spans, anchors: accepted };
}

export function linkSurfaces(frame: Pick<FlowFrame, 'quote' | 'meaning' | 'reflection'>, anchors: FlowAnchor[]) {
  const surfaces = (['quote', 'meaning', 'reflection'] as const).map(surface =>
    anchoredSpans(frame[surface], anchors.filter(anchor => (anchor.surface || 'reflection') === surface)
      .map(anchor => ({ ...anchor, surface }))));
  return { anchors: surfaces.flatMap(surface => surface.anchors), reflectionSpans: surfaces[2]!.spans };
}
