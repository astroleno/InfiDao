import type { FlowFrame, FlowSelection } from '@/lib/flow/contracts';

/** Keep a full-source selection inside an exact, readable canonical window. */
export function selectedSourceFrame(source: FlowFrame, selection: FlowSelection): FlowFrame {
  const text = source.fullText;
  if (selection.start < 0 || selection.end <= selection.start || selection.end > text.length || selection.textHash !== source.textHash || selection.corpusVersion !== source.corpusVersion) throw new Error('Source selection differs');
  let start = text.lastIndexOf('\n', selection.start - 1) + 1;
  let end = text.indexOf('\n', selection.end);
  if (end < 0) end = text.length;
  if (end - start > 80) { start = Math.max(start,selection.end-60); end = Math.min(text.length,start+80); }
  if (/[\uDC00-\uDFFF]/.test(text[start] || '')) start--;
  end = Math.min(end,start+80);
  if (/[\uDC00-\uDFFF]/.test(text[end] || '')) end--;
  if (start > selection.start || end < selection.end || end-start < 2) throw new Error('Selection needs a smaller source window');
  return {...source,quote:text.slice(start,end),quoteStart:start,quoteEnd:end};
}
