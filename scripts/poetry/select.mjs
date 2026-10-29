// Freeze a small, inspectable anthology. Runtime never downloads the source pool.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { normalize, topics } = require('../../shared/content/text.cjs');
const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/poetry/select.mjs <verified source directory>');
const acquisition = JSON.parse(readFileSync(path.join(root, 'acquisition.json')));
const sha = value => createHash('sha256').update(value).digest('hex');
const groups = [
  ['唐诗',550, p => /^全唐诗\/poet\.tang\./.test(p)],
  ['宋词',280, p => p.startsWith('宋词/')],
  ['宋诗',60, p => /^全唐诗\/poet\.song\./.test(p)],
  ['五代词',25, p => p === '五代诗词/nantang/poetrys.json'],
  ['元曲',35, p => p.startsWith('元曲/')],
  ['楚辞',20, p => p.startsWith('楚辞/')],
  ['汉诗',10, p => p.startsWith('曹操诗集/')],
  ['清词',20, p => p.startsWith('纳兰性德/')],
];
const authors = normalize('李白 杜甫 王维 孟浩然 白居易 李商隐 杜牧 王昌龄 王之涣 刘禹锡 柳宗元 韩愈 韦应物 岑参 高适 李贺 张若虚 张九龄 刘长卿 温庭筠 李清照 苏轼 辛弃疾 陆游 欧阳修 晏殊 柳永 周邦彦 姜夔 范仲淹 王安石 杨万里 朱熹 文天祥 秦观 贺铸 晏几道 张孝祥 马致远 张可久 白朴 张养浩 徐再思 乔吉 卢挚 关汉卿 贯云石 王实甫 郑光祖 屈原 宋玉 李煜 李璟 冯延巳 曹操 纳兰性德').split(' ');
const essentials = [
  '床前看月光','床前明月光','春江潮水连海平','君不见黄河之水天上来','蜀道之难难于上青天','浔阳江头夜送客',
  '汉皇重色思倾国','空山新雨后','渭城朝雨浥轻尘','海上生明月','昔人已乘黄鹤去','国破山河在','好雨知时节',
  '横看成岭侧成峰','水光潋滟晴方好','莫笑农家腊酒浑','泉眼无声惜细流','毕竟西湖六月中','死去元知万事空',
  '生当作人杰','胜日寻芳泗水滨','半亩方塘一鉴开','辛苦遭逢起一经','枯藤老树昏鸦','兴百姓苦',
  '一声梧叶一声秋','孤村落日残霞','碧云天黄叶地','明月几时有','莫听穿林打叶声','大江东去浪淘尽',
  '东风夜放花千树','寻寻觅觅冷冷清清','山一程水一程','人生若只如初见','东临碣石以观沧海','对酒当歌人生几何',
];
const compact = text => normalize(text).replace(/[^\p{L}\p{N}]/gu,'');
const pool = [];
const yuan = JSON.parse(readFileSync('data/poetry/yuan-selections.json'));
if (yuan.commit !== acquisition.commit) throw new Error('Yuan selection commit differs');
pool.push(...yuan.entries.map(row=>({...row,score:10000,key:sha(normalize(row.author)+'\0'+compact(row.text))})));
for (const file of acquisition.files.filter(f => f.path.endsWith('.json') && groups.some(([, , match]) => match(f.path))).sort((a,b)=>a.path.localeCompare(b.path,'en'))) {
  if (file.path.startsWith('元曲/')) continue;
  const bytes = readFileSync(path.join(root,file.path));
  if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== file.gitBlob) throw new Error('Source differs: '+file.path);
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows)) continue;
  for (const [index,row] of rows.entries()) {
    const lines = row.paragraphs || row.content || row.para;
    const title = String(row.title || row.rhythmic || '').trim();
    const author = String(row.author || (file.path.startsWith('曹操诗集/') ? '曹操' : '作者不详')).trim();
    const group = groups.find(([, , match])=>match(file.path))[0];
    if (['宋诗','元曲'].includes(group) && !authors.includes(normalize(author))) continue;
    if (!title || /^(句|残句|佚句)(?:\s|$)/u.test(normalize(title)) || !Array.isArray(lines) || !lines.every(s=>typeof s==='string')) continue;
    const text = lines.map(s=>s.replace(/\r\n?/g,'\n').trim()).join('\n').trim();
    if (!text || !/\p{Script=Han}/u.test(text) || /[\uE000-\uF8FF\uFFFD]/u.test(text+title+author) || author.includes('《')) continue;
    if (/存目|原诗已佚|原詩已佚|按[:：]|原注[:：]/u.test(title+text)) continue;
    // Avoid anthology reprints and dramatic fragments in this first edition.
    if (group==='唐诗' && /[歌曲舞]辭 /u.test(title)) continue;
    if (group==='清词' && !/^(长相思|木兰花|浣溪沙|画堂春|蝶恋花|采桑子|虞美人|临江仙|清平乐|南乡子|如梦令|菩萨蛮|鹊桥仙|鹧鸪天|沁园春|金缕曲|河传|浪淘沙|好事近|山花子|相见欢|梦江南|望江南|生查子|点绛唇|减字木兰花|踏莎行|忆江南|谒金门|酒泉子|秋千索|一络索|少年游|一丛花|于中好|琵琶仙)/u.test(title)) continue;
    const anthology = (row.tags || []).includes('唐诗三百首') || file.path.endsWith('/宋词三百首.json');
    const normalizedText = compact(text);
    const essential = essentials.some(s=>normalizedText.includes(s));
    const score = (essential?10000:0)+(anthology?2000:0)+(authors.includes(normalize(author))?300:0)+topics(text+title).length*10+(text.length>=20&&text.length<=1200?20:0);
    pool.push({path:file.path,record:index,gitBlob:file.gitBlob,title,author,text,textHash:sha(text),group,score,reason:essential?'代表作品与完整阅读回归':anthology?'上游选本标签':'作者、体裁与情境补充',key:sha(normalize(author)+'\0'+normalizedText)});
  }
}
const selected = [], used = new Set(), incipits = new Set();
for (const [group,count] of groups) {
  const candidates = pool.filter(r=>r.group===group).sort((a,b)=>b.score-a.score || a.title.length-b.title.length || a.path.localeCompare(b.path,'en') || a.record-b.record);
  const authorCounts = new Map();
  for (const cap of [40,80,Infinity]) {
    for (const row of candidates) {
      if (selected.filter(r=>r.group===group).length>=count) break;
      const incipit = normalize(row.author)+'\0'+compact(row.text).slice(0,16);
      if (used.has(row.key) || incipits.has(incipit) || (authorCounts.get(row.author)||0)>=cap) continue;
      selected.push(row);used.add(row.key);incipits.add(incipit);authorCounts.set(row.author,(authorCounts.get(row.author)||0)+1);
    }
  }
  if (selected.filter(r=>r.group===group).length!==count) throw new Error('Not enough verified unique works: '+group);
}
const entries=selected.map(({text:_text,key:_key,score:_score,...row})=>row);
writeFileSync('data/poetry/selection.json',JSON.stringify({schemaVersion:1,edition:'poetry-selected-1000-v2',commit:acquisition.commit,works:1000,policy:'以唐诗三百首标签、宋词三百首为骨架，补入代表作者、不同体裁和情境；同作者繁简归一后同文仅选一个来源。不是学术定本。',groups:Object.fromEntries(groups.map(([g,n])=>[g,n])),entries},null,2)+'\n');
console.log(JSON.stringify({works:entries.length,authors:new Set(entries.map(r=>r.author)).size,groups:Object.fromEntries(groups.map(([g,n])=>[g,n])),sourceFiles:new Set(entries.map(r=>r.path)).size}));
