"""Regenerate the Web Flow simplified glyph WOFFs.

Usage: python scripts/build-web-flow-sc-fonts.py PATH/TO/NotoSerifCJKsc-Regular.otf
Use FontTools 4.68.0 and ICU 78 uconv for the reviewed assets. The OTF
must be the source pinned in data/poetry/font-coverage.json.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
source_hash = "2a2eae2628df83556c54018c41e20fa532c1b862c5256ae8b3f23feb918d12ca"
if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
    raise SystemExit("Unexpected Noto Serif CJK SC source")

native_directory = root / "public/flow-fonts"
native = json.loads((native_directory / "manifest.json").read_text())
base = subprocess.check_output(
    ["node", "-p", "require('./miniprogram/assets/fonts/manifest').characters"],
    cwd=root, text=True,
).rstrip("\n")
legacy = base
for shard in native["shards"]:
    with TTFont(native_directory / shard["file"]) as font:
        if font["name"].getDebugName(6) == "nzgrKangxi":
            legacy += shard["characters"]
with TTFont(source) as font:
    cmap = font.getBestCmap()
    han = "".join(chr(cp) for cp in sorted(cmap)
                  if 0x3400 <= cp <= 0x9FFF or 0x20000 <= cp <= 0x323AF)


def conversions(transform):
    # Isolate characters so context-sensitive translations don't affect the set.
    converted = subprocess.check_output(
        ["uconv", "-x", transform], input="\n".join(han), text=True,
    ).split("\n")
    return [(original, char) for original, char in zip(han, converted, strict=True)
            if len(char) == 1 and original != char]


# Reverse conversion also catches ambiguous simplified characters such as 后.
# Subset the SC font at the original Unicode codepoints, with no text mapping.
hans = {original for original, _ in conversions("Hans-Hant")} | {
    target for _, target in conversions("Hant-Hans")
}
corrected = "".join(c for c in dict.fromkeys(legacy) if c in hans and ord(c) in cmap)
base_chars = "".join(c for c in corrected if c in base)
extra = "".join(c for c in corrected if c not in base)

directory = root / "public/flow-fonts/web-sc"
directory.mkdir(exist_ok=True)
records = []
for index, chars in enumerate([base_chars, *(extra[i:i + 350] for i in range(0, len(extra), 350))]):
    with TTFont(source, recalcTimestamp=False) as font:
        options = subset.Options()
        options.name_IDs = ["*"]
        options.layout_features = []
        builder = subset.Subsetter(options=options)
        builder.populate(unicodes=[ord(c) for c in chars])
        builder.subset(font)
        name = f"InfiDaoWebSerifSC-{index}"
        for record in font["name"].names:
            if record.nameID in (1, 3, 4, 6, 16, 18, 21):
                record.string = name.encode(record.getEncoding())
        font["CFF "].cff.fontNames = [name]
        for top in font["CFF "].cff.topDictIndex:
            top.FamilyName = top.FullName = name
        font.flavor = "woff"
        file = f"serif-sc-{index}.woff"
        font.save(directory / file)
    data = (directory / file).read_bytes()
    records.append({"file": file, "characters": chars, "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest()})
(directory / "manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
