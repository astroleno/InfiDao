"""Subset CoScroll's Kangxi font and supplement missing classical characters.

Requires fonttools. The full upstream font is a build input, not a runtime asset.
Usage: python scripts/build-font.py /path/to/润植家康熙字典美化体.ttf /path/to/NotoSerifSC[wght].ttf
"""
import hashlib
import base64
import io
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.basePen import BasePen
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
missing = set(characters) - {chr(code) for code in font.getBestCmap()}
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

# Canvas fonts can silently fall back on iPhone even after loadFontFace succeeds.
# Export the exact outlines needed by the optical scene, preserving curves and
# contours. Coordinates use 1/4096 em precision (<0.016px at DPR 2).
class OutlinePen(BasePen):
    def __init__(self, glyphs, units):
        super().__init__(glyphs)
        self.units = units
        self.data = bytearray()

    def command(self, opcode, *points):
        self.data.append(opcode)
        for point in points:
            for coordinate in point:
                self.data.extend(struct.pack("<h", round(coordinate / self.units * 4096)))

    def _moveTo(self, p): self.command(0, p)
    def _lineTo(self, p): self.command(1, p)
    def _qCurveToOne(self, p, q): self.command(2, p, q)
    def _curveToOne(self, p, q, r): self.command(3, p, q, r)
    def _closePath(self): self.command(4)
    def _endPath(self): pass

quotes = subprocess.check_output([
    "node", "-e", "process.stdout.write(JSON.stringify(Object.values(require(process.argv[1]).passages).map(p=>p.quote)))",
    str(root / "content/passages.js"),
], text=True)
flow_characters = set("".join(json.loads(quotes)))
outlines = {}
for face in [font, supplement]:
    glyphs = face.getGlyphSet()
    units = face["head"].unitsPerEm
    baseline = round((face["hhea"].ascent + face["hhea"].descent) / 2 / units * 4096)
    for codepoint, name in face.getBestCmap().items():
        char = chr(codepoint)
        if char not in flow_characters:
            continue
        pen = OutlinePen(glyphs, units)
        glyphs[name].draw(pen)
        outlines[char] = [round(glyphs[name].width / units * 4096), baseline, base64.b64encode(pen.data).decode("ascii")]
if flow_characters - outlines.keys():
    raise ValueError("Missing flow outlines: " + "".join(sorted(flow_characters - outlines.keys())))
lines = [json.dumps(char, ensure_ascii=False) + ":" + json.dumps(outlines[char], separators=(",", ":")) for char in sorted(outlines)]
(output / "flow-outlines.js").write_text("// Generated from the bundled fonts; attribution: NOTICE.txt and OFL.txt.\nmodule.exports = {\n" + ",\n".join(lines) + "\n};\n")
print(f"flow-outlines.js: {len(outlines)} glyphs, {(output / 'flow-outlines.js').stat().st_size} bytes")
