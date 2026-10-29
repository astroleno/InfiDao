"""Add only new poem glyphs; preserve every existing classic font shard."""
import sys, json, hashlib, pathlib
from fontTools.ttLib import TTFont
from fontTools import subset

root = pathlib.Path(__file__).resolve().parents[2]
font_path = pathlib.Path(sys.argv[1])
quality_path = pathlib.Path(sys.argv[2])
source_url = sys.argv[3] if len(sys.argv)>3 else 'https://github.com/notofonts/noto-cjk/blob/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf'
font_dir = root / 'public/flow-fonts'
manifest = json.loads((font_dir / 'manifest.json').read_text())
quality = json.loads(quality_path.read_text())
covered = set(''.join(s['characters'] for s in manifest['shards']))
# Existing base fonts are also registered by the web font release builder.
import subprocess
base = subprocess.check_output(['node', '-e', 'console.log(require("./miniprogram/assets/fonts/manifest.js").characters)'], cwd=root, text=True).strip()
covered.update(base)
needed = set(quality['characters']) - covered
font = TTFont(font_path)
cmap = font.getBestCmap()
available = sorted(c for c in needed if ord(c) in cmap)
unsupported = sorted(c for c in needed if ord(c) not in cmap)
font.close()
shards = []
source_digest = hashlib.sha256(font_path.read_bytes()).hexdigest()
for start in range(0,len(available),512):
    chars = ''.join(available[start:start+512])
    face = TTFont(font_path)
    options = subset.Options()
    options.recalc_timestamp = False
    options.flavor = 'woff'
    options.name_IDs = ['*']
    builder = subset.Subsetter(options=options)
    builder.populate(unicodes=[ord(c) for c in chars])
    builder.subset(face)
    derived_name='InfiDaoPoetry-'+source_digest[:8]+'-'+str(start)
    for name_id in (1,3,4,6,16,18,21):
        for record in face['name'].names:
            if record.nameID==name_id:
                record.string=derived_name.encode(record.getEncoding())
    if 'CFF ' in face:
        face['CFF '].cff.fontNames=[derived_name]
        for top in face['CFF '].cff.topDictIndex:
            top.FamilyName=derived_name
            top.FullName=derived_name
    face.flavor = 'woff'
    import io
    output = io.BytesIO()
    face.save(output)
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    name = 'poetry-'+digest[:20]
    (font_dir/(name+'.woff')).write_bytes(data)
    shards.append({'id':name,'file':name+'.woff','bytes':len(data),'sha256':digest,'characters':chars})
    face.close()
manifest['shards'].extend(shards)
manifest['unsupported'] = ''.join(sorted((set(manifest.get('unsupported','')) | set(unsupported))-set(available)))
manifest['version'] = hashlib.sha256(json.dumps(manifest,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:20]
(font_dir/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
source = {'source':source_url,'sourceSha256':source_digest,'addedCharacters':len(available),'shards':len(shards),'bytes':sum(s['bytes'] for s in shards)}
report_path=root/'data/poetry/font-coverage.json'
previous=json.loads(report_path.read_text()) if report_path.exists() else {}
sources=previous.get('sources',[])+[source]
report = {'sources':sources,'requiredCharacters':len(quality['characters']),'addedCharacters':sum(s['addedCharacters'] for s in sources),'shards':sum(s['shards'] for s in sources),'bytes':sum(s['bytes'] for s in sources),'unsupported':''.join(unsupported)}
(root/'data/poetry/font-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({**report,'unsupportedCount':len(unsupported)},ensure_ascii=False))
