// Search-only normalization. Canonical source text and its UTF-16 ranges never change.
const map = require('./traditional-simplified.json');
const normalize = value => Array.from(String(value || ''), c => map[c] || c).join('').toLowerCase();
const pairs = value => {
  const segments = normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(segments.flatMap(segment => {
    const chars = Array.from(segment);
    return chars.length === 1 ? chars : chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
  }))];
};
const imagery = [
  ['思乡', '想家|思乡|乡愁|故乡|故园|归家|乡关|客愁|客中|归心|旅宿|故国'],
  ['离别', '离别|告别|送别|送友|别离|分离|送君|赠别|相送|归舟|临别|送行|各奔|各自前程|分道|离开|辞行|分别'],
  ['相思', '相思|思念|想念|怀人|怀念|忆君|思君|忆故人|念远|惦念|牵挂'],
  ['月色', '月色|明月|月光|望月|中秋|夜月|月夜|月亮'],
  ['春景', '春景|春天|春暖|春光|春色|春风|春雨|暮春|早春|春日|阳春'],
  ['花景', '花开|开花|落花|花落|花谢|赏花|花事|梨花|桃花'],
  ['秋意', '秋天|秋意|秋风|秋雨|秋色|秋夜|落叶|悲秋|枫叶|红叶|菊花|寒雁'],
  ['山水', '山水|山川|江山|江水|青山|溪水|溪流|瀑布|山中|山里|山林|林间|登山|松风|山居|山路'],
  ['闲适', '闲适|闲居|悠闲|自在|安静|宁静|清静|静谧|安宁|清闲|归隐|隐居|田园|独坐|独钓|采菊|空山|休憩|休息|歇息|歇一|坐看|山居|闲静|松风|无事|坐一|放松|闲下来|停一|驻足|品茶|泡茶|泡杯茶|树荫|绿荫|不想安排|听鸟'],
  ['失意', '失意|失落|挫折|失望|怀才不遇|贬谪|不遇|落第|落魄|仕途|不顺|自勉|行路难|长风破浪|落选|落榜|受挫|失败|没被录取|未被录取|没考上|未考上|没通过|未通过'],
  ['时光', '时间|时光|岁月|年华|流逝|光阴|白发|华发|白头|千古|往事|人生|昨日|年少|多年|数年|十年|二十载|久以前|匆匆|留不住|不复返'],
  ['成长', '成长|长大|长成|少小|儿女忽成行|孩子.{0,8}(?:长高|身高)|儿女.{0,6}成'],
  ['流变', '流变|无常|流水|水流|流去|奔流|不复回|不复返|东流水|东逝水|东流|东去|浪淘|水长东|春去秋来|兴亡|盛衰|留不住'],
  ['友谊', '友谊|朋友|友情|故人|相知|知己|相逢|重逢|会友|老友|重见|未见|赠卫八'],
  ['重逢', '重逢|重见|久别|多年未见|别来|喜见|喜相逢|赠卫八|江南逢李龟年'],
  ['自勉', '自勉|仍愿|仍想|再出发|重新开始|长风破浪|直挂云帆|天生我材|行路难|再试|再来一次|再争取|不放弃|不甘心|不服气'],
  ['祝愿', '祝愿|祝福|珍重|保重|平安|顺遂|愿你|愿君|但愿|照顾好|莫愁|莫叹|劝君|勿谓|若比邻'],
  ['悲悼', '悲悼|悼亡|悼念|亡妻|死别|去世|离世|故去|孤坟|孤冢|生死|音容|九泉|墓|哭友|遣悲怀'],
  ['梦境', '梦'],
  ['怀旧', '怀旧|旧居|故居|旧地|故地|物是人非|人事|当年|重游|重访|旧时|今昔|人面|故宫|乌衣巷|台城|石头城|重走|旧路|重返|曾经|从前|往昔|小时候|旧街|老街|回忆'],
  ['登临', '登临|登楼|登高|望远|远眺|开阔|天地|岳阳楼|黄鹤楼|鹳雀楼|望洞庭'],
  ['羁旅', '羁旅|旅居|客舍|客居|漂泊|飘泊|羁愁|旅途|孤旅|行旅|夜泊|客中|客路|旅夜|旅宿|除夜|岁除|巴山夜雨|外地|他乡|异乡|舟车|舟行|车马|未安顿|安顿下来|辗转|奔波|远行|赶路|在路上|道中|孤帆|客船|宿建德江'],
  ['年节', '年节|过年|新年|除夕|除夜|岁除|元日|岁暮|年关|元夕|春节'],
  ['端午', '端午|端阳|重五|重午|竞渡|观渡|龙舟|粽|角黍|艾虎|蒲酒|钗符'],
  ['重阳', '重阳|重九|九日|茱萸|遍插'],
  ['七夕', '七夕|乞巧|鹊桥|牛郎|织女|牛女'],
  ['孤独', '孤独|孤单|寂寞|寂寥|独酌|独钓|独坐|独夜|孤舟|孤灯'],
  ['边塞', '战争|边塞|征战|征人|烽火|战场|从军|关山|塞下|出塞'],
  ['忧民', '忧民|百姓|疾苦|贫苦|饥寒|民生|伤农|悯农'],
  ['雨声', '下雨|雨声|雨夜|夜雨|听雨|细雨|风雨'],
  ['雪景', '雪|冬天|冬日'],
];
function topics(text) {
  const value = normalize(text);
  const labels = imagery.filter(([, pattern]) => new RegExp(pattern).test(value)).map(([label]) => label);
  // Broader concepts preserve ambiguity in the reader's input: a dream of an
  // absent relative can recall separation without asserting they have died.
  if (labels.includes('悲悼')) labels.push('相思', '离别');
  // A departure is a relation between people and an action, rather than every
  // occurrence of “friend”; elapsed preparation is not itself a time theme.
  if (/(?:朋友|亲人|父母|友人|送君|送友).{0,24}(?:启程|动身|上船|登车|远去|远行)/u.test(value)) labels.push('离别');
  if (/(?:鬓|头发).{0,6}(?:白|霜)|(?:日子|光阴|一年).{0,8}(?:快|过去|不觉)/u.test(value)) labels.push('时光');
  if (labels.includes('离别') && /很久|许久|久别|长久|多年/u.test(value)) labels.push('时光');
  return [...new Set(labels)];
}
function tokens(text) {
  // Canonical text also indexes joined bigrams so a quotation with omitted
  // punctuation remains searchable. Natural-language queries keep boundaries.
  const joined = normalize(text).replace(/[^\p{L}\p{N}]/gu, '');
  return [...new Set([...pairs(joined), ...Array.from(joined)])].join(' ');
}
function queryTokens(query) {
  const value = normalize(query);
  // Keep the scene bridge even when a natural-language query has many bigrams.
  return [...new Set([...topics(value), ...pairs(value)])].filter(s => !['如何', '什么', '怎么', '我想', '觉得', '可以', '一个', '现在', '一下', '很好', '我们'].includes(s)).slice(0, 24);
}
function vector(text) {
  const result = new Float32Array(64);
  for (const token of [...pairs(text), ...topics(text)]) {
    let hash = 2166136261;
    for (const c of token) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
    result[(hash >>> 0) % 64]++;
  }
  const magnitude = Math.hypot(...result) || 1;
  for (let i = 0; i < 64; i++) result[i] /= magnitude;
  return result;
}
function concreteTask(query) {
  const value = normalize(query);
  if (/(诗词|诗句|诗歌|古诗|唐诗|宋词|元曲|典故|形容|表达)/u.test(value)) return false;
  if (/(机票|票价|多少钱|股价|股票代码|汇率|怎么安装|如何安装|怎样升级|怎么升级|代码报错|用药剂量|实时比分)/u.test(value)) return true;
  return /(?:天气|下雨|下雪|降水|降雨|降雪|气温|温度)/u.test(value) && /(?:查|预报|有没有|是否|会不会|多少度|几度|什么时候|几点|带伞|会.{0,8}(?:雨|雪).{0,4}[吗么])/u.test(value);
}
// Retrieval diversity only: keep every canonical text and attribution intact.
// Long passages with a few changed glyphs should not occupy separate results.
function similarOriginal(a, b) {
  const left = Array.from(normalize(a).replace(/[^\p{L}\p{N}]/gu, ''));
  const right = Array.from(normalize(b).replace(/[^\p{L}\p{N}]/gu, ''));
  if (left.join('') === right.join('')) return true;
  if (Math.min(left.length, right.length) < 24 || Math.min(left.length, right.length) / Math.max(left.length, right.length) < .85) return false;
  if (left.length === right.length && left.filter((c, i) => c === right[i]).length / left.length >= .8) return true;
  const grams = chars => new Set(chars.slice(0, -2).map((c, i) => c + chars[i + 1] + chars[i + 2]));
  const l = grams(left), r = grams(right);
  return [...l].filter(gram => r.has(gram)).length / Math.max(l.size, r.size) >= .8;
}
module.exports = { normalize, pairs, topics, tokens, queryTokens, vector, similarOriginal, concreteTask };
