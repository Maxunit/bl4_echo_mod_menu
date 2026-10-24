from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Import the shipped example itself and exercise its two real JSON stores."""
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
from verify_catalog import Mod, BoolOption, SpinnerOption, SliderOption
class SDKSlider(SliderOption):
    def __init__(self, identifier, value, min_value, max_value, **kwargs):
        super().__init__(identifier, value, min_value=min_value, max_value=max_value, **kwargs)
from verify_providers import command
from bl4_echo_mod_menu.menu import catalog
from bl4_echo_mod_menu.menu.transactions import Mailbox

SOURCE = Path(__file__).resolve().parent


@contextmanager
def example(directory):
    base = ModuleType('mods_base')
    base.SETTINGS_DIR = Path(directory)
    base.Game = SimpleNamespace(BL4='BL4')
    base.BoolOption, base.SliderOption = BoolOption, SDKSlider
    class Spinner(SpinnerOption):
        def __init__(self, identifier, value, choices, **kwargs):
            super().__init__(identifier, value, choices=choices, **kwargs)
    base.SpinnerOption = Spinner
    def keybind(identifier, key=None, **kwargs):
        def decorate(callback):
            return SimpleNamespace(identifier=identifier, key=key, default_key=key,
                display_name=kwargs.get('display_name', identifier), is_hidden=False,
                is_rebindable=True, _rebind=lambda value: None)
        return decorate
    base.keybind = keybind
    def build_mod(**kwargs):
        mod = Mod()
        mod.__dict__.update(kwargs)
        mod.settings_file = Path(directory)/'example_sdk.json'
        def save():
            mod.settings_file.write_text(json.dumps({o.identifier: o.value for o in mod.options}))
        mod.save_settings = save
        return mod
    base.build_mod = build_mod
    spec = importlib.util.spec_from_file_location('echo_menu_example', SOURCE.parent/'examples/echo_menu_example/__init__.py')
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'mods_base': base, spec.name: module}):
        spec.loader.exec_module(module)
        yield module


class Tests(unittest.TestCase):
    def test_actual_example_import_catalog_apply_and_independent_persistence(self):
        with tempfile.TemporaryDirectory() as directory, example(directory) as module:
            registry = catalog.Registry(SimpleNamespace(get_ordered_mod_list=lambda: [module.mod]))
            row = registry.capture()['mods'][0]
            self.assertEqual(row['integration']['status'], 'active', row['integration'])
            self.assertEqual(len(row['options']), 6)
            box = Mailbox(); box.open(registry.snapshot)
            box.stage(dict(epoch=box.epoch, queue_revision=0, commands=[command(row, 'counter', 9), command(row, 'strength', 55)]))
            self.assertFalse(module.EXTRA_FILE.exists())
            result = registry.apply(box.close()['commands'])
            self.assertEqual(result['status'], 'applied', result)
            self.assertEqual(json.loads(module.EXTRA_FILE.read_text()), {'counter': 9})
            self.assertEqual(json.loads(module.mod.settings_file.read_text())['strength'], 55)

    def test_example_reloads_its_custom_store_and_needs_no_manager_import(self):
        with tempfile.TemporaryDirectory() as directory:
            with example(directory) as module:
                module.write_counter(12); module.save_extra()
            with example(directory) as reloaded:
                self.assertEqual(reloaded.read_counter(), 12)
                del reloaded.mod.echo_menu_provider
                row = catalog.capture(SimpleNamespace(get_ordered_mod_list=lambda: [reloaded.mod]))['mods'][0]
                self.assertEqual(row['integration']['status'], 'automatic')
                self.assertEqual(len(row['options']), 4)
            text = (SOURCE.parent/'examples/echo_menu_example/__init__.py').read_text()
            self.assertNotIn('import bl4_echo_mod_menu', text)
            self.assertNotIn('from bl4_echo_mod_menu', text)


if __name__ == '__main__': unittest.main(verbosity=2)
