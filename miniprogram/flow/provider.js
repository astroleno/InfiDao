const { passages, journeys } = require('../content/passages');

const DEFAULT_SEED = '我想让心慢下来';

function chooseJourney(seed) {
  if (/朋友|关系|相处|家人|同事|信任|理解|孤独|别人|他人/.test(seed)) return 'relate';
  if (/开始|行动|拖延|工作|学习|坚持|目标|做不到|做事|改变/.test(seed)) return 'act';
  return 'settle';
}

/**
 * FlowProvider boundary: open(seed) -> { kind, seed, journey, frames, cursor }.
 * A later server provider must return verified passage text separately from
 * generated reflection. The client never needs an API key or a model name.
 */
function createMockProvider() {
  return {
    async open(input) {
      const seed = String(input || '').trim().slice(0, 120) || DEFAULT_SEED;
      const journey = chooseJourney(seed);
      const frames = journeys[journey].map((entry, index) => ({
        ...passages[entry.id],
        id: entry.id,
        ordinal: index + 1,
        reflection: entry.reflection,
        bridge: entry.bridge,
        provenance: 'curated-mock',
      }));
      return { kind: 'mock', seed, journey, frames, cursor: null };
    },
  };
}

function validateSession(session) {
  if (!session || !Array.isArray(session.frames) || session.frames.length < 2 || session.frames.length > 8) {
    throw new Error('经文暂未到来，请稍后再试。');
  }
  session.frames.forEach(frame => {
    if (!frame.id || !frame.quote || !frame.source || !frame.fullText || !frame.reflection || !frame.sourceId) {
      throw new Error('这段经文还不完整，请稍后再试。');
    }
  });
  return session;
}

module.exports = { DEFAULT_SEED, chooseJourney, createMockProvider, validateSession };
