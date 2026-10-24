import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const source=fs.readFileSync(path.join(process.cwd(),'src/components/flow/flow.module.css'),'utf8');
const css=postcss.parse(source);
function values(selector: string,property: string) {
  const result:string[]=[];
  css.walkRules(rule=>{if(rule.selector.split(',').map(item=>item.trim()).includes(selector))rule.walkDecls(property,decl=>{result.push(decl.value);});});
  return result;
}

describe('the confirmed reading typography scale',()=>{
  it('uses three shared interface sizes and two explicit weights',()=>{
    expect(values('.experience','--flow-size-body')).toEqual(['20px']);
    expect(values('.experience','--flow-size-control')).toEqual(['16px']);
    expect(values('.experience','--flow-size-caption')).toEqual(['12px']);
    expect(values('.experience','--flow-weight-regular')).toEqual(['400']);
    expect(values('.experience','--flow-weight-medium')).toEqual(['500']);
  });
  it('keeps the primary quotation size and classical font stack',()=>{
    expect(values('.streamQuote','font-size')).toEqual(['clamp(30px, 4.4vw, 40px)','30px']);
    expect(source).toContain('"RunZhiJiaKangXiZidian", "InfiDaoSerifSupplement"');
  });
  it.each(['.streamReflection','.meaningBody','.sourcePanel','.noteItem','.libraryNote','.libraryQuote'])('maps %s to reading prose',selector=>{
    expect(values(selector,'font-size').every(value=>value==='var(--flow-size-body)')).toBe(true);
    expect(values(selector,'font-size').length).toBeGreaterThan(0);
  });
  it.each(['.topButton','.textButton','.notesPanel textarea','.seedSheet textarea'])('maps %s to controls and readable input text',selector=>{
    expect(values(selector,'font-size')).toContain('var(--flow-size-control)');
  });
  it.each(['.topBar','.readingMenuSource','.meaningHeader h2','.sectionLabel','.muted','.knowledgeDetail .muted','.knowledgeRelation .muted'])('maps %s to captions',selector=>{
    expect(values(selector,'font-size').every(value=>value==='var(--flow-size-caption)')).toBe(true);
  });
  it('does not leave one-off interface sizes or unapproved weights',()=>{
    css.walkDecls('font-size',decl=>{
      if(decl.parent?.type==='rule'&&(/streamQuote|readerQuote|lightQuote/.test(decl.parent.selector)||decl.parent.selector==='.staticFallback .classicText'))return;
      expect(decl.value).toMatch(/^var\(--flow-size-(body|control|caption)\)$/);
    });
    css.walkDecls('font-weight',decl=>expect(decl.value).toMatch(/^var\(--flow-weight-(regular|medium)\)$/));
  });
});
