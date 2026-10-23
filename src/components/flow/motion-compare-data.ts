import type { StreamEntry } from '@/lib/flow-browser/continuity';

// Fixed, local examples keep every pane identical and need no model request.
const samples = [
  {
    source: '大学', chapter: '经一章',
    words: ['知止', '而后', '有定', '，', '定', '而后', '能静', '，', '静', '而后', '能安', '，', '安', '而后', '能虑', '，', '虑', '而后', '能得', '。'],
    meaning: '先明白止于何处，才能安定下来；安定之后，才有从容思考的余地。',
    reflection: '从眼前这一件事开始。',
  },
  {
    source: '大学', chapter: '经一章',
    words: ['大学', '之道', '，', '在', '明明德', '，', '在', '亲民', '，', '在', '止于', '至善', '。'],
    meaning: '让内在的光明显现，也让自己的行动逐渐趋于完善。',
    reflection: '把这一念放回今天的生活。',
  },
  {
    source: '周易', chapter: '乾卦 · 象传',
    words: ['天行健', '，', '君子', '以', '自强不息', '。'],
    meaning: '天道运行刚健，君子由此勉励自己，持续修养与行动。',
    reflection: '一步一步，也是在向前。',
  },
  {
    source: '论语', chapter: '子路',
    words: ['君子', '和', '而', '不同', '，', '小人', '同', '而', '不和', '。'],
    meaning: '相处和谐，也可以保有各自的判断。',
    reflection: '听见差异，再看见彼此。',
  },
] as const;

export const MOTION_COMPARE_ENTRIES: StreamEntry[] = samples.map((sample, index) => {
  let end = 0;
  const quote = sample.words.join('');
  return {
    pathId: 'motion-comparison', chainId: 'motion-comparison', kind: 'curated',
    frame: {
      id: `motion-example-${index}`, ordinal: index,
      sourceId: `motion-source-${index}`, corpusVersion: 'motion-preview-v1', textHash: `motion-text-${index}`,
      quote, fullText: quote, quoteStart: 0, quoteEnd: quote.length,
      lexicalBreaks: sample.words.map(word => (end += word.length)),
      source: sample.source, chapterLabel: sample.chapter,
      meaning: sample.meaning, reflection: sample.reflection,
      reflectionSpans: [{ text: sample.reflection }], anchors: [], provenance: 'curated', ready: true,
    },
  };
});
