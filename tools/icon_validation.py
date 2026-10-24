"""Validate committed icon assets; ordinary builds need no image dependencies."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
RESOURCE_PREFIX = 'OakGame/Content/uiresources/echo_mod_menu/icons/'


def ui_icons() -> tuple[list[str], dict[str, bytes]]:
    manifest = json.loads((ROOT / 'src/bl4_echo_mod_menu/icons.json').read_text())
    names: list[str] = []
    resources: dict[str, bytes] = {}
    for item in manifest['icons']:
        name = item['id']
        assert name not in names and name.replace('-', '').isalnum(), name
        names.append(name)
        for extension in ('svg', 'png'):
            data = (ROOT / 'ui/icons' / (name + '.' + extension)).read_bytes()
            assert sha256(data).hexdigest() == item[extension + '_sha256'], name
            if extension == 'png':
                assert data.startswith(b'\x89PNG\r\n\x1a\n')
                assert struct.unpack_from('>II', data, 16) == (96, 96)
                resources[RESOURCE_PREFIX + name + '.png'] = data
    assert set(names) >= {'echo', 'puzzle', 'settings', 'camera', 'keyboard'}
    assert (ROOT / 'licenses/icons/Tabler-MIT.txt').is_file()
    return names, resources
