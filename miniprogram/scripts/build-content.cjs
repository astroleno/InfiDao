const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'content'), { recursive: true });
const corpus = fs.readFileSync(path.join(root, '../data/rysxguji/guji-core-v1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

const selections = {
  still: ['rysxguji-daxue-1-2', ['知止而后有定，', '定而后能静。'], '经一章'],
  order: ['rysxguji-daxue-1-3', ['物有本末，', '事有终始。'], '经一章'],
  near: ['rysxguji-zhongyong-1-1', ['道也者，', '不可须臾离也。'], '第一章'],
  self: ['rysxguji-lunyu-15-18', ['君子求诸己，', '小人求诸人。'], '卫灵公'],
  time: ['rysxguji-lunyu-9-13', ['逝者如斯夫，', '不舍昼夜！'], '子罕'],
  renewal: ['rysxguji-daxue-1-15', ['苟日新，', '日日新，又日新。'], '传二章'],
  haste: ['rysxguji-lunyu-13-15', ['无欲速，', '无见小利。'], '子路'],
  heart: ['rysxguji-mengzi-11-1', ['存其心，养其性，', '所以事天也。'], '尽心上'],
  harmony: ['rysxguji-lunyu-13-23', ['君子和而不同，', '小人同而不和。'], '子路'],
  reciprocity: ['rysxguji-zhongyong-1-16', ['施诸己而不愿，', '亦勿施于人。'], '第十三章'],
  respect: ['rysxguji-mengzi-7-25', ['爱人者，人恒爱之；', '敬人者，人恒敬之。'], '离娄下'],
  blame: ['rysxguji-lunyu-15-15', ['躬自厚而薄责于人，', '则远怨矣。'], '卫灵公'],
  seen: ['rysxguji-lunyu-1-12', ['不患人之不己知，', '患不知人也。'], '学而'],
  repair: ['rysxguji-lunyu-1-4', ['过则勿惮改。'], '学而'],
  begin: ['rysxguji-xunzi-2-8', ['道虽迩，不行不至；', '事虽小，不为不成。'], '修身'],
  finish: ['rysxguji-shijing-256-1', ['靡不有初，', '鲜克有终。'], '大雅 · 荡'],
};

// Plain-language glosses are curated commentary, never part of the quotation.
const meanings = {
  still: '知道应当达到、守住的目标，心志才有定向，进而能够安静。',
  order: '事物有根本和枝末，事情有开始和结束；认清先后，才接近做事的道理。',
  near: '道就在日常生活之中，一刻也不能离开。能被随意抛开的，就不是这里所说的道。',
  self: '君子遇事先要求自己，小人却一味要求别人。',
  time: '孔子望着流水，感叹流逝如水，昼夜不停。',
  renewal: '如果能让自己更新，就应当日日更新，不断更新。',
  haste: '做事不要一味求快，也不要只盯着眼前的小利。',
  heart: '保存本心、涵养本性，是孟子所说的事奉天命之道。',
  harmony: '君子能够与人和谐相处，同时保留不同的看法。',
  reciprocity: '自己不愿承受的事，也不要施加给别人。',
  respect: '以仁爱和敬意待人，也常会得到他人的爱与尊重。',
  blame: '对自己多作反省，对别人少些苛责，怨恨便能减少。',
  seen: '不必总担心别人不了解自己，更应留心自己是否了解别人。',
  repair: '发现过错，就不要害怕改正。',
  begin: '路再近，不走也到不了；事再小，不做也不能完成。',
  finish: '事情大都有一个开始，却很少能坚持到最后。',
};
const passages = {};
const normalize = value => value.replace(/[\s，。；：！？、“”‘’]/g, '');
for (const [id, [sourceId, lines, chapterLabel]] of Object.entries(selections)) {
  const row = corpus.find(entry => entry.id === sourceId);
  const quote = lines.join('');
  if (!row || !normalize(row.text).includes(normalize(quote))) throw new Error('Invalid source: ' + id);
  passages[id] = { sourceId, quote, lines, source: row.source, chapterLabel, fullText: row.text, meaning: meanings[id] };
}

const entry = (id, bridge, reflection) => ({ id, bridge, reflection });
const journeys = {
  settle: [
    entry('still', '一念 · 安顿', '先容自己停一停。心有了落处，眼前的事才渐渐清楚。'),
    entry('order', '从纷繁，回到先后', '不必同时安顿所有事。先看此刻真正需要照料的那一件。'),
    entry('haste', '让脚步，跟上自己', '急着抵达时，容易错过脚下。慢一点，也可以是在向前。'),
    entry('near', '答案，也在日常里', '安顿并不在生活之外。吃饭、行路、应答，都有重新开始的地方。'),
    entry('self', '把目光，收回可做处', '能改变的未必是所有境遇，却可能是自己今天的一次回应。'),
    entry('heart', '给内心，留一点位置', '照看自己的心，不急着压下每一种感受，也不急着随它走。'),
    entry('time', '容许事情，慢慢经过', '若总被“来不及”催着走，可以先把注意放回眼前正在做的一件事。'),
    entry('renewal', '再回到，此刻的一念', '重新开始可以很轻。把散开的注意，温柔地带回来。'),
  ],
  relate: [
    entry('harmony', '一念 · 相处', '亲近并不要求彼此相同。不同的声音，也可以被放在一起听。'),
    entry('reciprocity', '从自己，体会他人', '想起自己不愿承受的事，也许能更轻地对待眼前的人。'),
    entry('seen', '在被理解之前', '试着听见对方在意什么。理解，有时从一次认真倾听开始。'),
    entry('respect', '把善意，落在一件事上', '一句回应、一个兑现的约定，都可以让关心有具体的形状。'),
    entry('blame', '给彼此，留些余地', '看见自己能调整的部分，也容许他人有尚未做好的地方。'),
    entry('repair', '关系，可以慢慢修补', '承认一次不妥，不必否定整个人。愿意修正，本身就是靠近。'),
    entry('self', '回到自己的分寸', '如何回应，仍有自己可以选择的部分。先把这一步放稳。'),
    entry('near', '相处，就在此刻', '关系由细小的日常组成。下一次见面，仍可以重新开始。'),
  ],
  act: [
    entry('begin', '一念 · 起步', '把远处的目标收成眼前的一步。今天，先让一件小事发生。'),
    entry('order', '先辨先后，再用力', '把最要紧的事放在前面，力气就不必散在所有方向。'),
    entry('haste', '给行动，自己的节奏', '急切可以成为动力，也可能打乱步子。找回能持续的速度。'),
    entry('repair', '允许边做，边修正', '不必等到万事周全。看见偏差，再调一调方向。'),
    entry('finish', '让开始，有一个着落', '开头的心意值得珍惜，也值得用一次次小小的坚持接住。'),
    entry('self', '回到自己能做的', '把比较暂时放下。此刻能落实的一步，比别人的进度更近。'),
    entry('renewal', '每一天，都可更新', '昨天的迟疑，不必决定今天。再做一点，就有新的可能。'),
    entry('still', '停一停，再辨方向', '行动也需要停顿。记起最初为何出发，再让脚步继续。'),
  ],
};

fs.writeFileSync(path.join(root, 'content/passages.js'), '// Generated from the local corpus by scripts/build-content.cjs.\nmodule.exports = ' + JSON.stringify({ passages, journeys }, null, 2) + ';\n');
console.log('Verified and generated ' + Object.keys(passages).length + ' passages; 3 journeys.');
