import type { PassageRecord } from '@/types';

// The detailed modern decision guidance belongs to a reader's family question,
// not every later classical word or story mentioning a parent.
export function familyDecisionGuidance(seed: string) {
  if (!/(家人|父母|父亲|母亲|爸|妈|长辈|亲人|不孝)/u.test(seed) ||
    !/(决定|选择|自主|安排|替我|干涉|听从|服从|不孝)/u.test(seed)) return '';
  return '家庭自主必须在 reflection 正面回应今天的选择边界：由自己承担后果的个人选择，意见未被接受也不必自动放弃；涉及共同承担的事务则需协商。尊重、倾听和说明理由不等于交出决定权，不能默认以放弃选择换和气。meaning 负责必要古义；古书的特殊不从命情形不是现代人拥有个人选择的必要条件，不能暗示只有危害亲人等极端情形才可自主，也不能把个人偏好直接等同于义。原义若只是古代顺从规范，不能宣称它已经支持现代自主，尤其不能把“不违”等顺从用语改释为只是态度尊重。应选择更贴切的候选，或把现代引申与古义明确区分，明确称为今天的对照或应用，不假定年龄与法律身份。';
}

export function quotationKey(text: string) {
  return text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').replace(/缗蛮(?=黄鸟)/gu, '绵蛮');
}

export function repeatsQuotation(quote: string, previous: string[]) {
  const key = quotationKey(quote);
  return previous.some(text => { const original = quotationKey(text); return original.includes(key) || key.includes(original); });
}

// Keep the exact source bytes around a useful occurrence, including matches
// beyond a chapter's opening. Every quote is still checked against full text.
export function sourceExcerpt(text: string, terms: string[], required = '', limit = 720, avoidQuotes: string[] = []) {
  if (avoidQuotes.length && !required) {
    const regions: string[] = [];
    let start = 0;
    for (const match of text.matchAll(/[^。！？!?]+[。！？!?]*/gu)) {
      if (!repeatsQuotation(match[0], avoidQuotes)) continue;
      if (match.index > start) regions.push(text.slice(start, match.index));
      start = match.index + match[0].length;
    }
    if (start < text.length) regions.push(text.slice(start));
    let best = '', score = -1;
    for (const region of regions) {
      const excerpt = sourceExcerpt(region, terms, '', limit);
      if (quotationKey(excerpt).length < 2) continue;
      const next = terms.reduce((total, term) => total + (term && excerpt.includes(term) ? Math.min(term.length, 12) : 0), 0);
      if (next > score) { best = excerpt; score = next; }
    }
    return best;
  }
  if (text.length <= limit) return text;
  const requiredAt = required ? text.indexOf(required) : -1;
  const termsToFind = [...new Set(terms.filter(term => term.trim().length > 0))].slice(0, 24);
  const positions: number[] = [];
  for (const term of termsToFind) {
    let at = text.indexOf(term), count = 0;
    while (at >= 0 && count++ < 12) {
      positions.push(at); at = text.indexOf(term, at + term.length);
    }
  }
  const windowAt = (at: number, length = 0) => {
    let start = Math.max(0, at - Math.floor((limit - length) / 2));
    const end = Math.min(text.length, start + limit);
    start = Math.max(0, end - limit);
    // Avoid returning half a surrogate pair at either boundary.
    if (/[\uDC00-\uDFFF]/u.test(text[start] || '')) start++;
    const stop = /[\uD800-\uDBFF]/u.test(text[end - 1] || '') ? end - 1 : end;
    return text.slice(start, stop);
  };
  if (requiredAt >= 0) return windowAt(requiredAt, required.length);
  let best = windowAt(0), score = -1;
  for (const at of positions.length ? positions : [0]) {
    const excerpt = windowAt(at);
    const next = termsToFind.reduce((total, term) => total + (excerpt.includes(term) ? Math.min(term.length, 12) : 0), 0);
    if (next > score) { best = excerpt; score = next; }
  }
  return best;
}

export const CANDIDATE_EXCERPT_LIMIT = 480;

export function compactCandidates(rows: PassageRecord[], terms: string[], head?: { sourceId: string; quote: string }, avoidQuotes: string[] = []) {
  const excerpts = new Map(rows.map(row => [row.id, sourceExcerpt(row.text, terms, row.id === head?.sourceId ? head.quote : '', CANDIDATE_EXCERPT_LIMIT, avoidQuotes)]));
  rows = rows.filter(row => excerpts.get(row.id));
  const selected: PassageRecord[] = [], seen = new Set<string>(), books = new Map<string, number>();
  const add = (row: PassageRecord) => {
    if (seen.has(row.id) || selected.length >= 12) return;
    selected.push(row); seen.add(row.id); books.set(row.source, (books.get(row.source) || 0) + 1);
  };
  const fixed = head && rows.find(row => row.id === head.sourceId);
  if (fixed) add(fixed);
  rows.slice(0, 6).forEach(add);
  for (const row of rows) if (!books.has(row.source)) add(row);
  for (const row of rows) if ((books.get(row.source) || 0) < 3) add(row);
  rows.forEach(add);
  return { passages: selected, input: selected.map(row => ({ sourceId: row.id, source: row.source, chapter: row.chapter,
    text: excerpts.get(row.id)!, ...(row.work ? { work: row.work, excerptStart: row.text.indexOf(excerpts.get(row.id)!) } : {}) })) };
}
