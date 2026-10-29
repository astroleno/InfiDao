/** @jest-environment node */
const { queryTokens, topics, normalize, similarOriginal, concreteTask } = require('../../../shared/content/text.cjs');
test('bounded retrieval keeps scene concepts from long natural-language inputs', () => {
  const query = '最近事情一件接一件一直忙个不停，终于等到周末想去山中休息片刻';
  expect(queryTokens(query)).toEqual(expect.arrayContaining(['山水', '闲适']));
  expect(queryTokens(query).length).toBeLessThanOrEqual(24);
});
test('weather facts are distinguished from poetic expression and observed scenery', () => {
  expect(concreteTask('查询苏州今晚会不会下雪')).toBe(true);
  expect(concreteTask('我想知道这周是否降雨')).toBe(true);
  expect(concreteTask('想找描写下雨的古诗')).toBe(false);
  expect(concreteTask('此刻下雨，听着有些想念家乡')).toBe(false);
  expect(topics('雪白的山野')).toContain('雪景');
  expect(topics('角黍与艾虎')).toContain('端午');
  expect(topics('重九遍插茱萸')).not.toContain('端午');
});
test('near-identical texts diversify retrieval without conflating distinct poems on a shared theme', () => {
  const first = '迢遰三巴路，羇危萬里身。亂山殘雪夜，孤燭異鄉人。漸與骨肉遠，轉於僮僕親。那堪正漂泊，明日歲華新。';
  const second = '迢遞三巴路，羈危萬里身。亂山殘雪夜，孤燈異鄉人。漸與骨肉遠，轉於奴僕親。那堪正飄泊，來日歲華新。';
  expect(similarOriginal(first, second)).toBe(true);
  expect(similarOriginal('空山不見人，但聞人語響。返景入深林，復照青苔上。', '空山新雨後，天氣晚來秋。明月松間照，清泉石上流。')).toBe(false);
});
test('modern and canonical scene words share search-only concepts', () => {
  expect(topics('新年在异乡')).toEqual(expect.arrayContaining(['年节', '羁旅']));
  expect(topics('岁除夜旅宿')).toEqual(expect.arrayContaining(['年节', '羁旅']));
  const canonical = '舊時王謝堂前燕';
  expect(topics(canonical)).toContain('怀旧');
  expect(normalize(canonical)).toBe('旧时王谢堂前燕');
  expect(canonical).toBe('舊時王謝堂前燕');
});
test('flowering keeps its own imagery and does not turn autumn into spring', () => {
  expect(topics('枫叶丹，菊花开')).toEqual(expect.arrayContaining(['秋意', '花景']));
  expect(topics('枫叶丹，菊花开')).not.toContain('春景');
  expect(topics('春暖花开')).toContain('春景');
  expect(topics('亲人离开很久，梦里相见')).not.toContain('悲悼');
  expect(topics('千里孤坟，夜来幽梦')).toEqual(expect.arrayContaining(['悲悼', '相思', '离别', '梦境']));
});
test('scene bridges distinguish a departure and renewed effort from broad friendship and elapsed preparation', () => {
  expect(topics('友人明天动身远行')).toContain('离别');
  expect(topics('跟朋友谈人生')).not.toContain('离别');
  expect(topics('准备很久仍然落榜，但还要再争取')).toEqual(expect.arrayContaining(['失意', '自勉']));
  expect(topics('准备很久仍然落榜，但还要再争取')).not.toContain('时光');
  expect(topics('午后品茶听鸟')).toContain('闲适');
  expect(topics('不觉日子过去，鬓边又添霜')).toContain('时光');
  expect(topics('儿女忽成行')).toContain('成长');
  expect(topics('孩子又长高了')).toContain('成长');
  expect(queryTokens('比身高，才发现')).not.toContain('高才');
});
