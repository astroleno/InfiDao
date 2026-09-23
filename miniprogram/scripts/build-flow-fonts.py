"""Build versioned corpus font shards. Same two upstream fonts as build-font.py."""
import hashlib
import io
import json
import sys
from collections import Counter
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[2]
out = root / 'public/flow-fonts'
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / 'data/corpus-manifest.json').read_text())
counts = Counter()
for entry in manifest['files']:
    for line in (root / entry['path']).read_text().splitlines():
        counts.update(json.loads(line)['text'])
primary_path, supplement_path = map(Path, sys.argv[1:3])
primary = TTFont(primary_path, recalcTimestamp=False)
supplement = TTFont(supplement_path, recalcTimestamp=False)
if 'fvar' in supplement:
    instantiateVariableFont(supplement, {'wght': 400}, inplace=True)
supplement_bytes = io.BytesIO()
supplement.save(supplement_bytes)
glyphs = primary.getGlyphSet()
cmap = primary.getBestCmap()
groups = [[], []]
missing = []
for char, _ in counts.most_common():
    code = ord(char)
    if not char.strip():
        continue
    present = code in cmap
    if present:
        pen = BoundsPen(glyphs)
        glyphs[cmap[code]].draw(pen)
        present = pen.bounds is not None
    if present:
        groups[0].append(char)
    elif code in supplement.getBestCmap():
        groups[1].append(char)
    else:
        missing.append(char)
shards = []
for group, chars in enumerate(groups):
    for start in range(0, len(chars), 512):
        selected = ''.join(chars[start:start + 512])
        font = TTFont(primary_path if group == 0 else io.BytesIO(supplement_bytes.getvalue()), recalcTimestamp=False)
        options = subset.Options()
        options.recalc_timestamp = False
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
        worker = subset.Subsetter(options=options)
        worker.populate(text=selected)
        worker.subset(font)
        font.flavor = 'woff'
        data = io.BytesIO()
        font.save(data)
        binary = data.getvalue()
        digest = hashlib.sha256(binary).hexdigest()
        filename = digest[:20] + '.woff'
        (out / filename).write_bytes(binary)
        shards.append({'id': digest[:20], 'file': filename, 'characters': selected, 'bytes': len(binary), 'sha256': digest})
result = {'corpusVersion': manifest['version'], 'shards': shards, 'unsupported': ''.join(missing),
          'sources': [hashlib.sha256(p.read_bytes()).hexdigest() for p in (primary_path, supplement_path)]}
result['version'] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
(out / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
for notice in ['NOTICE.txt', 'OFL.txt']:
    (out / notice).write_bytes((root / 'miniprogram/assets/fonts' / notice).read_bytes())
print(json.dumps({'shards': len(shards), 'characters': sum(len(s['characters']) for s in shards), 'unsupported': len(missing), 'bytes': sum(s['bytes'] for s in shards)}))
