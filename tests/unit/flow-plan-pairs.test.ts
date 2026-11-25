import { mergePlanTerms } from '../../scripts/run-flow-plan-pairs';

test('keeps the primary verbatim and appends a distinct partner term in the eighth slot', () => {
  const primary = ['学习', '學習', '择', '慎思', '明辨', '笃行', '为人'];
  expect(mergePlanTerms(primary, ['明，辨', '读过', '！', '择善', '君子'], ['已经读过原文'])).toEqual({
    terms: [...primary, '择善'], added: ['择善'], skipped: [
      { term: '明，辨', reason: 'duplicate' }, { term: '读过', reason: 'already-read' },
      { term: '！', reason: 'empty' }, { term: '君子', reason: 'limit' },
    ],
  });
});

test('allows a single new character found in a prior quote but deduplicates its normalized spellings', () => {
  expect(mergePlanTerms(['其孰能御之', '与人同乐'], ['乐', '「乐」', '同乐'], ['乐亦在其中矣', '与百姓同乐'])).toEqual({
    terms: ['其孰能御之', '与人同乐', '乐'], added: ['乐'],
    skipped: [{ term: '「乐」', reason: 'duplicate' }, { term: '同乐', reason: 'already-read' }],
  });
});
