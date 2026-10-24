"""Validate the committed selector fonts without optional font-building packages."""
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
RESOURCE_PREFIX = 'OakGame/Content/uiresources/echo_mod_menu/fonts/'


def glyph_index(data, codepoint):
    """Read the BMP format-4 cmap emitted for our small TrueType subsets."""
    assert data[:4] == b'\x00\x01\x00\x00', 'Expected TrueType outlines'
    count = struct.unpack_from('>H', data, 4)[0]
    assert 0 < count < 64 and 12 + count * 16 <= len(data)
    tables = {}
    for index in range(count):
        tag, _, offset, size = struct.unpack_from('>4sIII', data, 12 + index * 16)
        assert offset + size <= len(data)
        tables[tag] = data[offset:offset + size]
    cmap = tables[b'cmap']
    mappings = struct.unpack_from('>H', cmap, 2)[0]
    for index in range(mappings):
        _, _, offset = struct.unpack_from('>HHI', cmap, 4 + index * 8)
        if struct.unpack_from('>H', cmap, offset)[0] != 4:
            continue
        size = struct.unpack_from('>H', cmap, offset + 2)[0]
        segments = struct.unpack_from('>H', cmap, offset + 6)[0] // 2
        sub = cmap[offset:offset + size]
        assert len(sub) == size and 0 < segments < 256
        end_at = 14
        start_at = end_at + segments * 2 + 2
        delta_at = start_at + segments * 2
        range_at = delta_at + segments * 2
        for segment in range(segments):
            start = struct.unpack_from('>H', sub, start_at + segment * 2)[0]
            end = struct.unpack_from('>H', sub, end_at + segment * 2)[0]
            if not start <= codepoint <= end:
                continue
            delta = struct.unpack_from('>H', sub, delta_at + segment * 2)[0]
            relative = struct.unpack_from('>H', sub, range_at + segment * 2)[0]
            if not relative:
                return (codepoint + delta) & 0xffff
            glyph = struct.unpack_from('>H', sub, range_at + segment * 2 + relative + (codepoint - start) * 2)[0]
            return (glyph + delta) & 0xffff if glyph else 0
    return 0


def label_fonts():
    manifest = json.loads((ROOT/'ui/fonts/manifest.json').read_text(encoding='utf-8'))
    languages = json.loads((ROOT/'src/bl4_echo_mod_menu/languages.json').read_text(encoding='utf-8'))
    names = {row['code']: row['name'] for row in languages}
    fonts = manifest['fonts']
    assert {font['code'] for font in fonts} == {'ja', 'ko', 'zh-hans', 'zh-hant', 'th'}
    for font in fonts:
        assert font['file'] == 'EchoLabels-' + font['code'] + '.ttf'
        assert font['family'] == 'ECHO Language Labels ' + font['code'].upper()
        assert font['text'] == names[font['code']]
        data = (ROOT/'ui/fonts'/font['file']).read_bytes()
        assert len(data) == font['bytes'] <= 65536
        assert hashlib.sha256(data).hexdigest() == font['sha256']
        assert all(glyph_index(data, ord(char)) != 0 for char in font['text'])
        license_text = (ROOT/'licenses/fonts'/font['license']).read_text(encoding='utf-8')
        assert 'SIL OPEN FONT LICENSE Version 1.1' in license_text
    return fonts
