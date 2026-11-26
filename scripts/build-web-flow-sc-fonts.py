"""Build the reviewed Web Flow glyph correction with FontTools 4.68.0.

Usage: python scripts/build-web-flow-sc-fonts.py PATH/TO/NotoSerifSC-Medium.otf
Source: https://raw.githubusercontent.com/notofonts/noto-cjk/Serif2.003/Serif/SubsetOTF/SC/NotoSerifSC-Medium.otf
"""
import hashlib
import json
from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# These Kangxi outlines render the traditional forms shown on the right.
# Assign the SC outlines to the same simplified codepoints as the input text.
REVIEWED = {"静": "靜", "剧": "劇", "谓": "謂", "虑": "慮", "乐": "樂", "终": "終"}
SOURCE_SHA256 = "e4e9beb5aaeb951e101aa8f122e2a6801ea9e48ac9f9b6bdfeef2436b55bc8ee"
NAME = "InfiDaoWebSerifSC-Medium"


def main(source):
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit("Unexpected Noto Serif SC Medium source")

    root = Path(__file__).resolve().parents[1]
    directory = root / "public/flow-fonts/web-sc/reviewed"
    directory.mkdir(exist_ok=True)
    file = "serif-sc.woff"
    codepoints = {ord(char) for char in REVIEWED}
    with TTFont(source, recalcTimestamp=False) as font:
        options = subset.Options()
        options.name_IDs = ["*"]
        options.layout_features = []
        builder = subset.Subsetter(options=options)
        builder.populate(unicodes=codepoints)
        builder.subset(font)
        if set(font.getBestCmap()) != codepoints:
            raise SystemExit("Unexpected Web serif correction coverage")
        for record in font["name"].names:
            if record.nameID in (1, 3, 4, 6, 16, 18, 21):
                record.string = NAME.encode(record.getEncoding())
        font["CFF "].cff.fontNames = [NAME]
        for top in font["CFF "].cff.topDictIndex:
            top.FamilyName = top.FullName = NAME
        font.flavor = "woff"
        font.save(directory / file)

    data = (directory / file).read_bytes()
    record = {
        "file": file,
        "characters": "".join(REVIEWED),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    (directory / "manifest.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
