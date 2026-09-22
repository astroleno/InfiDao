"""Subset CoScroll's Kangxi font and supplement missing classical characters.

Requires fonttools. The full upstream font is a build input, not a runtime asset.
Usage: python scripts/build-font.py /path/to/润植家康熙字典美化体.ttf /path/to/NotoSerifSC[wght].ttf
"""
import hashlib
import base64
import io
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
inputs = [root / "content/passages.js", root / "flow/provider.js"]
inputs += sorted((root / "pages").rglob("*.wxml"))
inputs += sorted((root / "pages").rglob("*.js"))
characters = set(chr(code) for code in range(32, 127))
for file in inputs:
    characters.update(re.findall(r"[^\x00-\x7f\s]", file.read_text()))
characters = "".join(sorted(characters))

source = Path(sys.argv[1])
font = TTFont(source, recalcTimestamp=False)
cmap = font.getBestCmap()
missing = set(characters) - {chr(code) for code in cmap}
# Kangxi maps digits, Latin and some punctuation to empty glyphs. A cmap entry
# alone blocks native fallback, leaving dates and paragraph numbers invisible.
glyphs = font.getGlyphSet()
for char in set(characters) - missing:
    if not char.strip():
        continue
    pen = BoundsPen(glyphs)
    glyphs[cmap[ord(char)]].draw(pen)
    if pen.bounds is None:
        missing.add(char)
output = root / "assets/fonts"
output.mkdir(parents=True, exist_ok=True)

def write_subset(font, chars, filename, notice):
    options = subset.Options()
    options.recalc_timestamp = False
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)
    if "fvar" in font:
        instantiateVariableFont(font, {"wght": 400}, inplace=True)
    # Preserve the source's names, attribution and licensing metadata.
    font.flavor = "woff"
    buffer = io.BytesIO()
    font.save(buffer)
    binary = buffer.getvalue()
    encoded = base64.b64encode(binary).decode("ascii")
    chunks = ",\n".join("  '" + encoded[i:i + 120] + "'" for i in range(0, len(encoded), 120))
    (output / filename).write_text(f"// Generated WOFF subset; see {notice}. Rebuild with scripts/build-font.py.\nmodule.exports = [\n" + chunks + "\n].join('');\n")
    print(f"{filename}: {len(chars)} glyphs, {len(binary)} WOFF bytes / {len(encoded)} base64 bytes")

supplement_source = Path(sys.argv[2])
supplement = TTFont(supplement_source, recalcTimestamp=False)
uncovered = missing - {chr(code) for code in supplement.getBestCmap()}
if uncovered:
    raise ValueError("Missing glyphs: " + "".join(sorted(uncovered)))
write_subset(font, set(characters) - missing, "serif-data.js", "NOTICE.txt")
write_subset(supplement, missing, "supplement-data.js", "OFL.txt")
manifest = {"family": "RunZhiJiaKangXiZidian", "weight": 400, "characters": characters,
            "source": "CoScroll/public/fonts/润植家康熙字典美化体.ttf",
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "supplementFamily": "InfiDaoSerifSupplement", "supplementCharacters": "".join(sorted(missing)),
            "supplementSource": "https://github.com/google/fonts/tree/main/ofl/notoserifsc",
            "supplementSourceSha256": hashlib.sha256(supplement_source.read_bytes()).hexdigest()}
(output / "manifest.js").write_text("// Generated font provenance and glyph coverage.\nmodule.exports = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n")

# Both page text and Canvas consume these font files. Quotation-specific
# outlines are intentionally not generated; the runtime resolves each cmap.
