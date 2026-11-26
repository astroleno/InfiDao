"""Build Web Flow WOFF assets. See public/flow-fonts/web-tc/README.md."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public/flow-fonts/web-tc/release.json"
LICENSES = ROOT / "public/flow-fonts/web-tc"
BASE_LIMIT = 96 * 1024
SHARD_LIMIT = 256 * 1024
RELEASE_LIMIT = 8 * 1024 * 1024
SOURCES = {
    "wenkai-tc": ("InfiDao WenKai TC", "LXGW WenKai TC Regular", "1.530",
                  "6662480a3f95b4a90c80b189c679617a48adce3a505118a6af63ce5a482b83fa",
                  "WenKaiTC-OFL.txt"),
    "wenkai": ("InfiDao WenKai Extended", "LXGW WenKai Regular", "1.530",
               "2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b",
               "WenKai-OFL.txt"),
    "noto": ("InfiDao Noto TC Rare", "Noto Serif CJK TC Regular", "Serif2.003",
             "234301038e76e7c35c43113785024700c4e4fe7bdce1d1fbbc42fca7e6683798",
             "Noto-OFL.txt"),
    "hanazono": ("InfiDao Hanazono Rare", "Hanazono Mincho B", "2017-09-04",
                 "829543436cdf7b4c6730e2af5806fa406f8ddf0d4b656e0cd49c58d4db1c8d3c",
                 "Hanazono-LICENSE.txt"),
}


def encoded(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check_source(path, key):
    if sha(path.read_bytes()) != SOURCES[key][3]:
        raise SystemExit(f"{key}: unexpected source font digest")


def real_coverage(source, chars):
    with TTFont(source, recalcTimestamp=False) as font:
        cmap, glyphs = font.getBestCmap(), font.getGlyphSet()
        covered = set()
        for char in chars:
            name = cmap.get(ord(char))
            if not name or name == ".notdef":
                continue
            pen = DecomposingRecordingPen(glyphs)
            glyphs[name].draw(pen)
            if pen.value or char.isspace():
                covered.add(char)
        return covered


def make_woff(source, family, characters):
    with TTFont(source, recalcTimestamp=False) as font:
        options = subset.Options()
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
        options.layout_features = []
        options.drop_tables += ["meta", "FFTM"]
        options.recalc_timestamp = False
        # Each WOFF is registered independently and final spacing comes from
        # the same advances in DOM and Canvas.
        builder = subset.Subsetter(options=options)
        builder.populate(unicodes=map(ord, characters))
        builder.subset(font)
        font["name"].removeNames(nameID=16)
        font["name"].removeNames(nameID=17)
        for record in font["name"].names:
            if record.nameID in (1, 3, 4, 6):
                value = family.replace(" ", "") if record.nameID == 6 else family
                record.string = value.encode(record.getEncoding())
        if "CFF " in font:
            name = family.replace(" ", "")
            font["CFF "].cff.fontNames = [name]
            for top in font["CFF "].cff.topDictIndex:
                top.FullName = top.FamilyName = family
        actual, expected = set(font.getBestCmap()), set(map(ord, characters))
        if not expected <= actual:
            raise ValueError(f"{family}: subset misses {[hex(value) for value in sorted(expected - actual)]}")
        for table in font["cmap"].tables:
            if hasattr(table, "cmap"):
                table.cmap = {code: glyph for code, glyph in table.cmap.items() if code in expected}
        font.flavor = "woff"
        output = io.BytesIO()
        font.save(output)
        return output.getvalue()


def build(source_paths, targets):
    core, poetry = (targets[name] for name in ("core", "poetry"))
    mandatory = set("".join(targets["opening"] + targets["fixtures"])) - {"\n", "\r", "\t"}
    counts = Counter("".join(core + poetry))
    desired = (set(counts) | mandatory) - {"\n", "\r", "\t"}
    local_assets = {}
    licenses = []
    sources = []

    def add_face(key, characters, *, base=False, data=None):
        family, _, _, _, _ = SOURCES[key]
        if data is None:
            data = make_woff(source_paths[key], family, characters)
        if len(data) > SHARD_LIMIT:
            if base or len(characters) < 2:
                raise ValueError(f"{family}: face exceeds the shard budget")
            pivot = len(characters) // 2
            return add_face(key, characters[:pivot]) + add_face(key, characters[pivot:])
        digest = sha(data)
        asset_id = f"{key}-{digest[:20]}"
        file = asset_id + ".woff"
        local_assets[file] = data
        asset = dict(id=asset_id, file=file, bytes=len(data), sha256=digest, characters=characters)
        if base:
            asset["family"] = family
        return [asset]

    for key, source in source_paths.items():
        check_source(source, key)
    primary = real_coverage(source_paths["wenkai-tc"], desired)
    ordered = sorted(primary - mandatory, key=lambda c: (-counts[c], c))
    # Keep the complete opening and a reusable set of frequent glyphs in the
    # one preloaded face. The bound leaves room for the preload manifest.
    base_chars = "".join(sorted(mandatory & primary)) + "".join(ordered[:100])
    base_data = make_woff(source_paths["wenkai-tc"], SOURCES["wenkai-tc"][0], base_chars)
    base_assets = add_face("wenkai-tc", base_chars, data=base_data, base=True)
    remaining_primary = ordered[100:]
    shards = [asset for i in range(0, len(remaining_primary), 512)
              for asset in add_face("wenkai-tc", "".join(remaining_primary[i:i + 512]))]

    missing = desired - primary
    for key in ("wenkai-tc", "wenkai", "noto", "hanazono"):
        if key != "wenkai-tc":
            cover = real_coverage(source_paths[key], missing)
            if not cover:
                continue
            shards.extend(add_face(key, "".join(sorted(cover))))
            missing -= cover
        _, name, version, digest, license_file = SOURCES[key]
        sources.append(dict(id=key, name=name, version=version, sha256=digest))
        license_data = (LICENSES / license_file).read_bytes()
        local_assets[license_file] = license_data
        licenses.append(dict(file=license_file, bytes=len(license_data), sha256=sha(license_data)))

    manifest = dict(schemaVersion=2, sources=sources, licenses=licenses, baseCharacters=base_chars,
                    baseFonts=base_assets, shards=shards, unsupported="".join(sorted(missing)))
    version = sha(encoded(manifest))[:20]
    manifest["version"] = version
    manifest_bytes = encoded(manifest) + b"\n"
    preload_bytes = len(base_data) + len(manifest_bytes)
    total_bytes = sum(map(len, local_assets.values())) + len(manifest_bytes)
    if preload_bytes > BASE_LIMIT or total_bytes > RELEASE_LIMIT:
        raise ValueError(f"Web font budget exceeded: preload {preload_bytes}, release {total_bytes}")

    destination = ROOT / "public/flow-assets" / ("v-" + version)
    destination.mkdir(exist_ok=True)
    for file, data in local_assets.items():
        (destination / file).write_bytes(data)
    (destination / "manifest.json").write_bytes(manifest_bytes)
    INDEX.write_bytes(encoded(dict(version=version, manifestSha256=sha(manifest_bytes))) + b"\n")

    def coverage(texts):
        return dict(passages=len(texts), primaryPassages=sum(set(text) - {"\n", "\r", "\t"} <= primary for text in texts),
                    occurrences=sum(map(len, texts)), primaryMissing=sum(sum(count for char, count in Counter(text).items()
                        if char not in primary and char not in "\n\r\t") for text in texts))

    print(json.dumps(dict(version=version, preloadBytes=preload_bytes, baseFontBytes=len(base_data),
        manifestBytes=len(manifest_bytes), totalBytes=total_bytes, largestShard=max(shard["bytes"] for shard in shards),
        cores=coverage(core), poetry=coverage(poetry), fallback=[(s["file"], len(s["characters"]), s["bytes"])
            for s in shards if not s["id"].startswith("wenkai-tc-")], unsupported="".join(sorted(missing))),
        ensure_ascii=False, indent=2))


def main():
    if fontTools.__version__ != "4.68.0":
        raise SystemExit("Use FontTools 4.68.0")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("targets", type=Path)
    for key in SOURCES:
        parser.add_argument("--" + key, type=Path, required=True)
    args = parser.parse_args()
    build({key: getattr(args, key.replace("-", "_")) for key in SOURCES},
          json.loads(args.targets.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
