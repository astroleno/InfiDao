"""Render grayscale sprite coverage directly to alpha; no white threshold or font substitution."""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor/inko'))
import numpy as np
from PIL import Image
import scene
import _pen as pen_renderer
from _common import save_image, xmp_packet, text_height

Image.MAX_IMAGE_PIXELS = 12_000_000


def verify_text_coverage(document, text):
    if document.get('text') != text:
        raise ValueError('SCENE_TEXT_MISMATCH')
    covered = bytearray(len(text.encode('utf-16-le')) // 2)
    for page in document.get('pages', []):
        for glyph in page.get('glyphs', []):
            start, end = glyph.get('i'), glyph.get('j')
            if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(covered):
                raise ValueError('SCENE_TEXT_RANGE')
            covered[start:end] = bytes([1]) * (end - start)
    offset = 0
    for char in text:
        size = len(char.encode('utf-16-le')) // 2
        if not char.isspace() and not all(covered[offset:offset + size]):
            raise ValueError('SCENE_TEXT_INCOMPLETE')
        offset += size


def prepare(folder, content):
    # Add an aggregate bound to the upstream renderer's per-member/path checks.
    with zipfile.ZipFile(folder / 'scene.zip') as archive:
        if sum(info.file_size for info in archive.infolist()) > 512 * 1024 * 1024 or len(archive.infolist()) > 200:
            raise ValueError('SCENE_TOO_LARGE')
    package = scene.open_package(folder / 'scene.zip')
    verify_text_coverage(package.doc, content['text'])
    if (package.doc.get('label') or {}).get('mode') == 'none':
        raise ValueError('SCENE_LABEL_MISSING')
    state = scene.State(package, [])
    if not 1 <= len(state.pages) <= 60:
        raise ValueError('SCENE_PAGE_COUNT')
    pages = []
    for i, page in enumerate(package.doc['pages']):
        width, height = scene._paper(package, page).size
        if width * height > 12_000_000 or width < 1000 or height < 1000:
            raise ValueError('SCENE_PAGE_SIZE')
        image = Image.new('RGBA', (width, height))
        for pen, glyphs in state.layers(i):
            ink = np.ones((height, width), np.float32)
            for glyph in glyphs:
                scene.place_sprite(ink, package.sprite(glyph), glyph.m)
            coverage = (1.0 - ink) if pen_renderer.is_default(pen) else pen_renderer.apply(ink, pen, package.pen_ppm, origin=(0, 0))
            rgba = np.empty((height, width, 4), np.uint8)
            rgba[..., :3] = pen_renderer.ink_rgb(pen)
            rgba[..., 3] = np.clip(np.rint(coverage * 255), 0, 255).astype(np.uint8)
            image = Image.alpha_composite(image, Image.fromarray(rgba, 'RGBA'))
        # Pillow paste(image, mask=image) squares alpha on a transparent destination.
        # Composite the original label with straight alpha so its antialiased edges survive.
        label = package.label_image()
        xy = (package.doc.get('label') or {}).get('xy')
        if label is None or not isinstance(xy, list) or len(xy) != 2:
            raise ValueError('SCENE_LABEL_MISSING')
        x, y = int(xy[0]), int(xy[1])
        if text_height(label) < 0.05 * min(width, height) or x < 0 or y < 0 or x + label.width > width or y + label.height > height:
            raise ValueError('SCENE_LABEL_INVALID')
        image.alpha_composite(label, (x, y))
        pid = page.get('aigc_id') or f"{(package.doc.get('job') or {}).get('id', 'inko')}-p{i + 1}"
        fields = scene.aigc_fields(package, pid)
        name = f'layer-{i}.png'
        save_image(image, folder / name, {'aigc': fields}, dpi=300)
        pages.append({'index': i, 'width': width, 'height': height, 'layer': name, 'aigc': fields, 'xmp': xmp_packet(fields)})
    (folder / 'prepared.json').write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    return pages
