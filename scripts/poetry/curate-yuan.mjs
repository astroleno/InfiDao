// Explicit sub-work boundaries: the upstream Yuan JSON often groups many songs.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.argv[2];if(!root)throw new Error('Usage: node scripts/poetry/curate-yuan.mjs <verified source directory>');
const acquisition=JSON.parse(readFileSync(path.join(root,'acquisition.json'))),sourcePath='元曲/yuanqu.json';
const source=acquisition.files.find(f=>f.path===sourcePath),bytes=readFileSync(path.join(root,sourcePath));
if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==source.gitBlob)throw new Error('Yuan source differs');
const rows=JSON.parse(bytes),sha=s=>createHash('sha256').update(s).digest('hex');
const specs=[];
function group(record,prefix,parts){for(const [title,begin,end] of parts)specs.push({record,title:prefix+title,begin,end});}
group(9958,'双调・水仙子',[
  ['夜雨',null,'弹唱佳人玉纤'],['弹唱佳人','弹唱佳人','红指甲落花'],['红指甲','红指甲','佳人钉履金莲'],['佳人钉履','佳人钉履','春情九分'],
  ['春情','春情','青玉花筒蜂房'],['重九','重九','马嵬坡翠华'],['马嵬坡','马嵬坡','惠山泉自天'],['惠山泉','惠山泉',null],
]);
group(9955,'双调・蟾宫曲',[
  ['西湖',null,'钱子云赴都赋河梁'],['登太和楼','登太和楼','竹夫人湘妃'],['竹夫人','竹夫人','姑苏台荒台'],['姑苏台','姑苏台','名姬玉莲荆山'],
  ['春情','春情','西湖寻春清明'],['西湖寻春','西湖寻春','送沙宰宦游'],['送沙宰','送沙宰','月问青天呼酒'],['西湖夏宴','西湖夏宴','红梅蕊珠'],['红梅','红梅',null],
]);
group(9953,'越调・天净沙',[
  ['探梅',null,'吕侯席上素波'],['春情','春情','渔父忘形'],['渔父','渔父','秋江夜泊斜阳'],['秋江夜泊','秋江夜泊','题情多才'],['题情','题情',null],
]);
group(7470,'双调・寿阳曲',[
  ['山市晴岚',null,'远浦帆归夕阳'],['远浦帆归','远浦帆归','平沙落雁南传'],['平沙落雁','平沙落雁','潇湘夜雨渔灯'],['潇湘夜雨','潇湘夜雨','烟寺晚钟寒烟'],
  ['烟寺晚钟','烟寺晚钟','渔村夕照鸣榔'],['渔村夕照','渔村夕照','江天暮雪天将'],['江天暮雪','江天暮雪','洞庭秋月芦花'],['洞庭秋月','洞庭秋月',null],
]);
group(55,'双调・大德歌',[
  ['春',null,'夏俏冤家'],['夏','夏','秋风飘飘'],['秋','秋','冬雪纷纷'],['冬','冬',null],
]);
specs.push({record:7467,title:'越调・天净沙秋思',begin:null,end:null});
const entries=specs.map(spec=>{
  const row=rows[spec.record],full=row.paragraphs.map(s=>s.replace(/\r\n?/g,'\n').trim()).join('\n').trim();
  let start=spec.begin===null?0:full.indexOf(spec.begin)+spec.begin.length,end=spec.end===null?full.length:full.indexOf(spec.end,start);
  if(start<0||end<start||(spec.begin&&full.indexOf(spec.begin)<0))throw new Error('Unclear source heading: '+spec.title);
  while(/\s/u.test(full[start]||'')&&start<end)start++;while(/\s/u.test(full[end-1]||'')&&end>start)end--;
  const text=full.slice(start,end);
  if(!text||/[□讠亻氵衤扌忄]/u.test(text))throw new Error('Unresolved Yuan text: '+spec.title);
  return {path:sourcePath,record:spec.record,gitBlob:source.gitBlob,title:spec.title,author:row.author,group:'元曲',sourceRange:{start,end},fullSourceHash:sha(full),textHash:sha(text),text,reason:'按源内题目与小令结构核对的独立作品，固定原文范围；不把源合集冒充一首'};
});
if(entries.length!==35)throw new Error('Yuan selection must contain 35 works');
writeFileSync('data/poetry/yuan-selections.json',JSON.stringify({commit:acquisition.commit,sourcePath,entries},null,2)+'\n');
console.log(JSON.stringify({works:entries.length,sourceRecords:new Set(entries.map(e=>e.record)).size,authors:[...new Set(entries.map(e=>e.author))]}));
