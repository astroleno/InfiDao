/** @jest-environment node */
import fs from 'node:fs';
const entries=JSON.parse(fs.readFileSync('data/poetry/yuan-selections.json','utf8')).entries as Array<{title:string;text:string;sourceRange:{start:number;end:number}}>;
test('Night Rain is a complete single song rather than the entire upstream anthology row',()=>{
  const work=entries.find(e=>e.title==='双调・水仙子夜雨')!;
  expect(work.text).toBe('一声梧叶一声秋，一点芭蕉一点愁，三更归梦三更后。\n落灯花棋未收，叹新丰孤馆人留。\n枕上十年事，江南二老忧，都到心头。');
  expect(work.text).not.toContain('弹唱佳人');expect(entries).toHaveLength(35);
});
test('explicit individual season songs do not carry the next song or unresolved glyphs',()=>{
  const autumn=entries.find(e=>e.title==='双调・大德歌秋')!;
  expect(autumn.text.startsWith('风飘飘，雨潇潇')).toBe(true);expect(autumn.text.endsWith('淅零零细雨打芭蕉。')).toBe(true);
  for(const entry of entries){expect(entry.text).not.toMatch(/[□讠亻氵衤扌忄]/u);expect(entry.sourceRange.end-entry.sourceRange.start).toBe(entry.text.length);}
});
