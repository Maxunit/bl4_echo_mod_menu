"""Isolated distribution check: real imports/HTTP/persistence, stubbed game SDK.

Invoked with Python -I so an extracted source package cannot mask the archive.
Native memory access is replaced at the scene boundary; this is not a game test.
"""
import hashlib
import http.client
import importlib
import json
import os
from pathlib import Path
import pkgutil
import sys
from threading import get_ident
from types import ModuleType, SimpleNamespace


def main():
    search, game, expected_format = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]
    settings = game / 'sdk_mods/settings'
    starting_thread = get_ident()
    logs, writes, created = [], [], []
    archive_hash = hashlib.sha256(search.read_bytes()).hexdigest() if search.is_file() else None
    os.chdir(game.parent)
    sys.path.insert(0, str(search))

    class Hooks:
        Type = SimpleNamespace(POST=1)
        def __init__(self): self.rows = {}
        def has_hook(self, path, kind, ident): return (path, kind, ident) in self.rows
        def add_hook(self, path, kind, ident, callback):
            self.rows[(path, kind, ident)] = callback
            return False  # SDK may return False even after a successful insert.
        def remove_hook(self, path, kind, ident): self.rows.pop((path, kind, ident), None)

    hooks = Hooks()
    def prop(name, kind):
        return type(kind, (), {'Name': name, 'PropertyFlags': 0x80})()
    activate = type('UFunction', (), {
        'NumParams': 2,
        '_path_name': lambda self: '/Script/GbxUICoherent.GbxUIScript:Activate',
        '_properties': lambda self: iter([
            prop('WorldContextObject', 'ZObjectProperty'),
            prop('OwningWidgetDef', 'ZGbxDefPtrProperty')]),
    })()
    native_class = SimpleNamespace(
        _path_name=lambda: '/Script/GbxUICoherent.GbxUIScript',
        _fields=lambda: iter([activate]))
    sdk = ModuleType('unrealsdk')
    sdk.hooks = hooks
    sdk.find_class = lambda name: native_class
    sdk.logging = SimpleNamespace(info=logs.append, error=logs.append)
    base = ModuleType('mods_base')
    base.Game = SimpleNamespace(BL4='BL4')
    base.Library = object
    base.SETTINGS_DIR = settings
    def build_mod(**kwargs):
        assert kwargs['cls'] is base.Library
        mod = SimpleNamespace(**kwargs, is_enabled=True, enabling_locked=True,
                              settings_file=None, get_status=lambda: 'Loaded')
        created.append(mod)
        assert kwargs['on_enable']() is True
        return mod
    base.build_mod = build_mod
    base.get_ordered_mod_list = lambda: created
    sys.modules.update(unrealsdk=sdk, mods_base=base)

    package = importlib.import_module('bl4_echo_mod_menu')
    assert len(created) == 1 and len(hooks.rows) == 1
    assert not settings.exists(), 'Import must not create settings or run a scene'
    # Import every actual runtime module. This exercises all archive resource
    # reads without executing Win64 game memory operations.
    for info in pkgutil.walk_packages(package.__path__, package.__name__ + '.'):
        importlib.import_module(info.name)
    from bl4_echo_mod_menu import lifecycle as auto, metadata, paths
    from bl4_echo_mod_menu.menu import controller, server
    from bl4_echo_mod_menu.integration import API_VERSION
    from bl4_echo_mod_menu.resources import read_json
    from bl4_echo_mod_menu.scene import lifecycle as scene, native, queue_native
    assert metadata.distribution_info()['format'] == expected_format
    assert metadata.distribution_info()['ui_revision'] == '1.0.0'
    assert API_VERSION == 1 and queue_native._PROFILE['guards']
    cfg = read_json('bl4_echo_mod_menu.scene', 'config.json')
    assert scene.Session(sdk, None, settings/'scene.json', logs.append).config == cfg
    class ReachedValidation(Exception): pass
    def validate(memory, config):
        assert config == cfg
        raise ReachedValidation
    native.validate_image = validate
    try:
        native.prepare(None, sdk, 'apply')
    except ReachedValidation:
        pass
    else:
        raise AssertionError('Default native resource was not read')
    assert paths.locate_game_root(package.__file__, working_directory=game.parent) == game
    assert paths.settings_directory() == settings
    assert server.report_directory() == settings/'bl4_echo_mod_menu'
    if expected_format == 'sdkmod':
        assert not (game/'sdk_mods/bl4_echo_mod_menu').exists()
        imported = [m for n, m in sys.modules.items() if n == package.__name__ or n.startswith(package.__name__+'.')]
        assert len(imported) >= 20
        assert all(str(search) in m.__file__ for m in imported)

    class SliderOption:
        identifier = display_name = 'Archive value'
        is_hidden, min_value, max_value, step, is_integer = False, 0, 10, 1, True
        default_value = 3
        description = 'Archive integration check'
        def __init__(self): self._value = 3
        @property
        def value(self): return self._value
        @value.setter
        def value(self, value):
            assert get_ident() == starting_thread
            writes.append(value)
            self._value = value
    option = SliderOption()
    fixture = SimpleNamespace(name='Archive fixture', version='1', author='Fixture',
        description='', is_enabled=True, enabling_locked=True, options=[option],
        keybinds=[], settings_file=settings/'archive_fixture.json', get_status=lambda: 'Enabled')
    def save():
        assert get_ident() == starting_thread
        fixture.settings_file.write_text(json.dumps({'value': option.value}), encoding='utf-8')
    fixture.save_settings = save
    advanced = {'value': 2, 'reads': 0, 'writes': 0}
    def read_advanced():
        assert get_ident() == starting_thread
        advanced['reads'] += 1
        return advanced['value']
    def write_advanced(value):
        assert get_ident() == starting_thread
        advanced['writes'] += 1
        advanced['value'] = value
    def save_advanced():
        assert get_ident() == starting_thread
        (settings/'archive_fixture_extra.json').write_text(json.dumps({'value': advanced['value']}))
    fixture.echo_menu_provider = {'api_version': 1, 'id': 'archive.fixture',
        'categories': [{'id': 'config', 'name': {'en': 'Config', 'de': 'Konfiguration'}}],
        'options': [{'id': 'standard', 'option': option, 'category': 'config'}],
        'settings': [{'id': 'advanced', 'kind': 'number', 'min': 0, 'max': 10, 'step': 1,
                      'integer': True, 'default': 2, 'category': 'config',
                      'read': read_advanced, 'write': write_advanced}], 'save': save_advanced}
    created.append(fixture)
    # Keep native execution outside this cross-platform test. Actual menu,
    # transport, staging, close-triggered application and shutdown are unchanged.
    scene._active = None
    def start_scene(*args): scene._active = object(); return True
    def stop_scene(): scene._active = None; return True
    scene.start, scene.stop = start_scene, stop_scene
    controller.hook_metadata = lambda sdk: [
        {'path': '/ArchiveFixture:Activate', 'mode': 'apply'},
        {'path': '/ArchiveFixture:Deactivate', 'mode': 'release'}]
    service_type = server.MenuService
    server.MenuService = lambda: service_type(port=0)
    obj = SimpleNamespace(Class=SimpleNamespace(_path_name=lambda: controller.SCRIPT_CLASS))
    def args(name): return SimpleNamespace(OwningWidgetDef=SimpleNamespace(_name=name))
    auto.on_activate(obj, args(controller.NAV))
    session = controller._active
    assert session is not None, logs
    assert not auto._installed
    session.on_event('apply', obj, args(controller.OWN))
    service = session.service
    assert service.report['native_installation']['status']=='declared_on_disk'
    assert service.report['native_installation']['runtime_import_verified'] is False
    def post(route, data):
        connection = http.client.HTTPConnection('127.0.0.1', service.http.server_port, timeout=3)
        connection.request('POST', server.PREFIX+route, json.dumps({'token': server.BUILD_TOKEN, **data}))
        response = connection.getresponse()
        value = json.loads(response.read())
        assert response.status == 200, (response.status, value)
        connection.close()
        return value
    catalog = post('/catalog', {})
    row = next(m for m in catalog['catalog']['mods'] if m['name'] == fixture.name)
    entry = next(o for o in row['options'] if o['identifier'] == 'standard')
    extra = next(o for o in row['options'] if o['identifier'] == 'advanced')
    assert row['integration']['status'] == 'active'
    reads_before_http = advanced['reads']
    post('/preferences', {'language': 'de'})
    post('/stage', {'epoch': catalog['epoch'], 'queue_revision': catalog['queue_revision'],
        'commands': [{'kind': 'value', 'mod': row['id'], 'option': entry['id'], 'expected': 3, 'value': 9},
                     {'kind': 'value', 'mod': row['id'], 'option': extra['id'], 'expected': 2, 'value': 8}]})
    assert option.value == 3 and not writes
    assert advanced['reads'] == reads_before_http and advanced['writes'] == 0
    session.on_event('release', obj, args(controller.NAV))
    assert option.value == 9 and writes == [9]
    assert json.loads(fixture.settings_file.read_text()) == {'value': 9}
    assert advanced['value'] == 8 and advanced['writes'] == 1
    assert json.loads((settings/'archive_fixture_extra.json').read_text()) == {'value': 8}
    assert service.report['distribution']['format'] == expected_format
    report_path = service.path
    assert auto.stop() is True
    assert not hooks.rows and not service.thread.is_alive()
    assert report_path.is_relative_to(settings)
    assert json.loads(service.preferences_path.read_text()) == {'language': 'de'}
    if archive_hash:
        assert hashlib.sha256(search.read_bytes()).hexdigest() == archive_hash
        assert not (game/'sdk_mods/bl4_echo_mod_menu').exists()
    assert any('format='+expected_format in line for line in logs)
    print(json.dumps({'format': expected_format, 'complete_import': True,
        'resources_from_importer': True, 'http_stage_then_native_close_fixture': True,
        'outside_archive_persistence': True, 'clean_shutdown': True,
        'single_package_root': True, 'game_sdk_mocked': True, 'native_calls': 0,
        'game_runtime_tested': False}))


if __name__ == '__main__': main()
