"""Resource/transport regressions for optional artwork, including real ZIPs."""
from __future__ import annotations

from contextlib import contextmanager
from hashlib import sha256
import base64
import http.client
import importlib
import json
from pathlib import Path
import struct
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4
import zipfile
import zlib

from test_bootstrap import prepare_package
prepare_package()
from bl4_echo_mod_menu.integration import artwork
from bl4_echo_mod_menu.menu.catalog import Registry
from bl4_echo_mod_menu.menu.server import MenuService, PREFIX
from verify_catalog import Mod
from icon_validation import ui_icons
from build import native_resources
from pak_codec import read_pak, write_pak

ROOT = Path(__file__).resolve().parent.parent


def chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack('>I', len(data)) + kind + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff))


def png(width: int = 2, height: int = 2, color: int = 100) -> bytes:
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    rows = (b'\x00' + bytes([color, 60, 90, 128]) * width) * height
    return (artwork.PNG_SIGNATURE + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


@contextmanager
def loaded_package(directory: str, archived: bool = False):
    name = 'artwork_fixture_' + uuid4().hex
    root = Path(directory)
    data = png()
    payload = {'__init__.py': b'mod = None\n', 'assets/logo.png': data,
               'assets/other.png': png(color=200), 'assets/broken.png': b'bad PNG'}
    if archived:
        location = root / (name + '.sdkmod')
        with zipfile.ZipFile(location, 'w') as archive:
            for path, content in payload.items():
                archive.writestr(name + '/' + path, content)
    else:
        location = root
        for path, content in payload.items():
            target = root / name / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    sys.path.insert(0, str(location))
    importlib.invalidate_caches()
    try:
        package = importlib.import_module(name)
        package.mod = Mod()
        yield package, data
    finally:
        sys.modules.pop(name, None)
        sys.path.remove(str(location))
        sys.path_importer_cache.pop(str(location), None)


class Tests(unittest.TestCase):
    def test_png_container_crc_dimensions_and_animation_limits(self):
        valid = png()
        self.assertEqual(artwork.png_dimensions(valid), (2, 2))
        bad_crc = bytearray(valid)
        bad_crc[-1] ^= 1
        animated = valid[:33] + chunk(b'acTL', struct.pack('>II', 1, 0)) + valid[33:]
        for data in (b'not png', valid[:-1], bytes(bad_crc), valid + b'trailing',
                     animated, png(4097, 1), png(4096, 2049)):
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                artwork.png_dimensions(data)
        with patch.object(artwork, 'MAX_PNG_BYTES', len(valid) - 1):
            with self.assertRaises(ValueError):
                artwork.png_dimensions(valid)

    def test_canonical_relative_paths(self):
        self.assertEqual(str(artwork.resource_path('assets/Logo.PNG')), 'assets/Logo.PNG')
        for path in ('../a.png', '/a.png', './a.png', 'assets/../a.png',
                     'assets//a.png', 'a\\b.png', 'C:/a.png', 'https://a/a.png',
                     'a.png?x', 'a%2e.png', 'a.svg', '', None, 'x\x00.png'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                artwork.resource_path(path)

    def test_folder_and_archive_resources_preserve_exact_bytes(self):
        for archived in (False, True):
            with self.subTest(archived=archived), tempfile.TemporaryDirectory() as directory:
                with loaded_package(directory, archived) as (package, data):
                    package.mod.echo_menu_artwork = {
                        'package': package.__name__, 'icon': 'assets/logo.png',
                        'header': 'assets/logo.png', 'category_icons': {'camera': 'camera'},
                    }
                    registry = Registry(SimpleNamespace(get_ordered_mod_list=lambda: [package.mod]))
                    row = registry.capture()['mods'][0]
                    ref = row['artwork']['header']
                    self.assertEqual(row['artwork']['icon'], ref)
                    self.assertEqual(ref, {'id': sha256(data).hexdigest(), 'width': 2, 'height': 2})
                    self.assertEqual(registry.artwork, {ref['id']: data})
                    self.assertNotIn(package.__name__, json.dumps(row))
                    self.assertNotIn('assets/logo.png', json.dumps(row))

    def test_only_loaded_packages_owning_the_mod_are_read(self):
        with tempfile.TemporaryDirectory() as directory:
            with loaded_package(directory) as (package, _):
                store = artwork.ArtworkCatalog()
                for mod, name in ((Mod(), package.__name__),
                                  (package.mod, 'unimported_artwork_package')):
                    with self.assertRaises(ValueError):
                        store.image(mod, name, 'assets/logo.png')
                self.assertNotIn('unimported_artwork_package', sys.modules)
                self.assertEqual(store.assets, {})

    def test_broken_artwork_keeps_provider_and_sdk_settings_writable(self):
        mod = Mod()
        mod.echo_menu_provider = {'api_version': 1, 'id': 'fixture.artwork',
                                 'options': [{'id': 'flag', 'option': mod.boolean}]}
        registry = Registry(SimpleNamespace(get_ordered_mod_list=lambda: [mod]))
        for source in (42, {'icon': 'camera', 'header': '../missing.png'},
                       {'header': 'assets/missing.png', 'package': 'not_loaded'}):
            mod.echo_menu_artwork = source
            row = registry.capture()['mods'][0]
            self.assertEqual(row['integration']['status'], 'active')
            self.assertNotIn('header', row['artwork'])
            self.assertTrue(row['artwork']['warnings'])
            flag = next(item for item in row['options'] if item['identifier'] == 'flag')
            result = registry.apply([{'kind': 'value', 'mod': row['id'],
                                      'option': flag['id'], 'expected': mod.boolean.value,
                                      'value': not mod.boolean.value}])
            self.assertEqual(result['status'], 'applied')

    def test_capture_budget_deduplicates_and_rejects_escaped_links(self):
        with tempfile.TemporaryDirectory() as directory:
            with loaded_package(directory) as (package, data):
                store = artwork.ArtworkCatalog()
                with patch.object(artwork, 'MAX_TOTAL_BYTES', len(data)):
                    ref = store.image(package.mod, package.__name__, 'assets/logo.png')
                    self.assertEqual(store.image(package.mod, package.__name__, 'assets/logo.png'), ref)
                    with self.assertRaises(ValueError):
                        store.image(package.mod, package.__name__, 'assets/other.png')
                outside = Path(directory) / 'outside.png'
                outside.write_bytes(data)
                link = Path(directory) / package.__name__ / 'assets/link.png'
                try:
                    link.symlink_to(outside)
                except OSError:
                    return  # Windows CI may not grant symlink privileges.
                with self.assertRaises(ValueError):
                    store.image(package.mod, package.__name__, 'assets/link.png')
                self.assertEqual(store.total_bytes, len(data))

    def test_real_http_artwork_transfer_requires_active_epoch_and_never_reads_packages(self):
        data = png()
        asset_id = sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            service = MenuService(port=0, directory=directory)
            try:
                service.artwork = {asset_id: data}
                service.mailbox.open({'mods': [], 'errors': []})
                def post(body):
                    connection = http.client.HTTPConnection('127.0.0.1', service.http.server_port, timeout=3)
                    try:
                        connection.request('POST', PREFIX + '/artwork', json.dumps(body),
                                           {'Content-Type': 'text/plain'})
                        reply = connection.getresponse()
                        return reply.status, json.loads(reply.read())
                    finally:
                        connection.close()
                request = {'token': 'echo-menu-v1', 'epoch': service.mailbox.epoch, 'id': asset_id}
                with patch.object(artwork, 'files', side_effect=AssertionError('Worker package read')):
                    status, reply = post(request)
                    self.assertEqual(status, 200)
                    self.assertEqual(base64.b64decode(reply['data_url'].split(',', 1)[1]), data)
                    self.assertEqual(post(dict(request, token='wrong'))[0], 403)
                    self.assertEqual(post(dict(request, epoch='old'))[0], 409)
                    self.assertEqual(post(dict(request, id='0' * 64))[0], 404)
                    self.assertEqual(post(dict(request, id='../../file.png'))[0], 404)
                    service.mailbox.close()
                    self.assertEqual(post(request)[0], 409)
                self.assertFalse(service.report['errors'])
            finally:
                service.stop()

    def test_committed_icons_and_tps_overlay_keep_provenance_and_original_logic(self):
        names, resources = ui_icons()
        self.assertEqual(len(names), 21)
        self.assertEqual(len(list((ROOT / 'ui/icons').glob('*'))), 42)
        for data in resources.values():
            self.assertEqual(artwork.png_dimensions(data), (96, 96))
        pak_files = {**native_resources(), **resources}
        self.assertGreater(len(pak_files), 10)
        self.assertEqual(read_pak(write_pak(pak_files)), pak_files)
        overlay = ROOT / 'integrations/tps_artwork'
        manifest = json.loads((overlay / 'manifest.json').read_text())
        module = (overlay / 'sdk_mods/BL4ThirdPersonPOC/echo_menu.py').read_bytes()
        addition = ("    owner.mod.echo_menu_artwork = {\n"
                    "        'package': owner.__name__,\n"
                    "        'icon': 'camera',\n"
                    "        'header': 'assets/BL4_TPS_LOGO_TRANSPARENT.png',\n"
                    "    }\n").encode()
        self.assertEqual(module.count(addition), 1)
        self.assertEqual(sha256(module.replace(addition, b'')).hexdigest(), manifest['base_echo_menu_sha256'])
        logo = (overlay / 'sdk_mods/BL4ThirdPersonPOC/assets/BL4_TPS_LOGO_TRANSPARENT.png').read_bytes()
        self.assertEqual(sha256(logo).hexdigest(), manifest['logo_sha256'])
        self.assertEqual(artwork.png_dimensions(logo), (1920, 1080))


if __name__ == '__main__':
    unittest.main(verbosity=2)
