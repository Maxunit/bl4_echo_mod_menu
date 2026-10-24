from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Execute the actual SDK keybind/options/persistence source with a stub game.

The SDK's Python 3.14 unparenthesized except list is parenthesized for the
local 3.12 interpreter. All keybind/option logic is executed unchanged.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from threading import get_ident
from types import ModuleType, SimpleNamespace
import unittest
import warnings
from unittest.mock import patch

import verify_catalog as harness_module
from bl4_echo_mod_menu.menu import catalog, controller
from bl4_echo_mod_menu.menu.transactions import Mailbox, Rejected

SOURCE = Path(__file__).resolve().parent
MAIN = get_ident()
calls = []


def sdk_modules():
    sdk = ModuleType('unrealsdk')
    sdk.logging = SimpleNamespace(error=lambda *a: None)
    sdk.find_enum = lambda name: SimpleNamespace(IE_Pressed=0, IE_Released=1)
    hooks = ModuleType('unrealsdk.hooks'); hooks.Block = type('Block', (), {})
    package = ModuleType('fixture_sdk'); package.MODS_DIR = Path(tempfile.gettempdir()) / 'echo_sdk_fixture'
    loaded = []
    with patch.object(warnings, 'deprecated', lambda *a, **kw: lambda obj: obj, create=True), patch.dict(sys.modules, {'unrealsdk': sdk, 'unrealsdk.hooks': hooks, 'fixture_sdk': package}):
        for stem, name in [('keybinds', 'sdk_keybinds'), ('options', 'sdk_options'), ('settings', 'sdk_settings')]:
            full = 'fixture_sdk.' + stem
            module = ModuleType(full); module.__file__ = str(SOURCE / 'fixtures' / (name + '.py.txt'))
            module.__package__ = 'fixture_sdk'; sys.modules[full] = module
            source = Path(module.__file__).read_text().replace('except FileNotFoundError, json.JSONDecodeError:', 'except (FileNotFoundError, json.JSONDecodeError):')
            exec(compile(source, module.__file__, 'exec'), module.__dict__)
            loaded.append(module)
    # Keep dataclass modules available for type metadata, independently of fake SDK.
    for module in loaded: sys.modules[module.__name__] = module
    return loaded


kb, opts, settings = sdk_modules()


def rebind(self, value):
    calls.append((get_ident(), self.identifier, value))


kb.KeybindType._rebind = rebind


class Tests(unittest.TestCase):
    def fixture(self, path=None):
        mod = SimpleNamespace(name='Fixture Mod', version='1', author='SDK', is_enabled=True,
            enabling_locked=True, options=[], keybinds=[], settings_file=path, auto_enable=True)
        for name, default, current in [('Toggle Third Person','F5','F5'), ('Dump Camera State','F8',None), ('Dump Slide State','F9',None)]:
            binding = kb.KeybindType(name, default, lambda: None)
            option = opts.KeybindOption.from_keybind(binding)
            mod.keybinds.append(binding); mod.options.append(option)
            binding.key = current  # Config loads keybinds after options.
        # Real SDK display iterator creates a *new* copy for every traversal.
        mod.iter_display_options = lambda: iter(mod.options + [opts.KeybindOption.from_keybind(b) for b in mod.keybinds])
        mod.save_settings = lambda: settings.default_save_mod_settings(mod)
        registry = catalog.Registry(SimpleNamespace(get_ordered_mod_list=lambda: [mod]))
        snapshot = registry.capture(); self.assertFalse(snapshot['errors'])
        mailbox = Mailbox(); mailbox.open(snapshot); calls.clear()
        return mod, registry, mailbox

    def command(self, mailbox, ident, value):
        row = mailbox.catalog['mods'][0]; spec = next(o for o in row['options'] if o['identifier'] == ident)
        return dict(kind='value', mod=row['id'], option=spec['id'], expected=spec['value'], value=value)

    def stage(self, mailbox, *commands):
        return mailbox.stage(dict(epoch=mailbox.epoch, queue_revision=mailbox.revision, commands=list(commands)))

    def test_actual_sdk_one_way_copy_and_authoritative_null(self):
        mod, registry, mailbox = self.fixture()
        self.assertEqual(mod.options[1].value, 'F8'); self.assertIsNone(mod.keybinds[1].key)
        row = mailbox.catalog['mods'][0]
        self.assertEqual(len(row['options']), 3)  # No stale duplicates, even when values differ.
        self.assertEqual([o['value'] for o in row['options']], ['F5', None, None])
        self.assertTrue(all(o['editable'] and o['source']=='registered_keybind' for o in row['options']))
        self.assertEqual([o['default'] for o in row['options']], ['F5', 'F8', 'F9'])
        self.assertTrue(registry.snapshot['capabilities']['keybind_writes'])

    def test_rebind_once_save_real_keybinds_and_reload_including_unbound(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'mod.json'; mod, registry, mailbox = self.fixture(path)
            self.stage(mailbox, self.command(mailbox, 'Dump Camera State', 'NumPadZero'), self.command(mailbox, 'Toggle Third Person', None))
            self.assertFalse(calls); self.assertIsNone(mod.keybinds[1].key)
            result = registry.apply(mailbox.close()['commands'])
            self.assertEqual(result['status'], 'applied')
            self.assertEqual(calls, [(MAIN,'Dump Camera State','NumPadZero'), (MAIN,'Toggle Third Person',None)])
            saved = json.loads(path.read_text())
            self.assertEqual(saved['keybinds'], {'Toggle Third Person':None,'Dump Camera State':'NumPadZero','Dump Slide State':None})
            self.assertEqual(saved['options']['Dump Camera State'], 'F8')  # Deliberately don't rebind a second time via stale option.
            new, fresh, mb = self.fixture(path)
            new.enable = lambda: None
            settings.default_load_mod_settings(new)
            self.assertEqual([b.key for b in new.keybinds], [None, 'NumPadZero', None])
            self.assertEqual([o['value'] for o in fresh.capture()['mods'][0]['options']], [None, 'NumPadZero', None])

    def test_hidden_locked_and_duplicate_registered_bindings(self):
        mod, registry, mailbox = self.fixture()
        mod.keybinds[1].is_hidden = True; mod.keybinds[2].is_rebindable = False
        row = registry.capture()['mods'][0]
        self.assertEqual(len(row['options']), 2)
        self.assertFalse(next(o for o in row['options'] if o['identifier']=='Dump Slide State')['editable'])
        mod.keybinds.append(kb.KeybindType('Toggle Third Person','F6',lambda:None))
        row = registry.capture()['mods'][0]
        self.assertFalse(next(o for o in row['options'] if o['identifier']=='Toggle Third Person')['editable'])

    def test_external_changes_locks_replacement_refuse_entire_batch(self):
        for mode in ['change','hidden','locked','removed','replacement','duplicate','identifier']:
            with self.subTest(mode=mode):
                mod, registry, mailbox = self.fixture()
                self.stage(mailbox,self.command(mailbox,'Toggle Third Person','F6'),self.command(mailbox,'Dump Camera State','F10'))
                b = mod.keybinds[1]
                if mode=='change':b.key='F11'
                if mode=='hidden':b.is_hidden=True
                if mode=='locked':b.is_rebindable=False
                if mode=='removed':mod.keybinds.remove(b)
                if mode=='replacement':mod.keybinds[1]=kb.KeybindType(b.identifier,None,lambda:None)
                if mode=='duplicate':mod.keybinds.append(kb.KeybindType(b.identifier,None,lambda:None))
                if mode=='identifier':b.identifier='Different'
                calls.clear(); result=registry.apply(mailbox.close()['commands'])
                self.assertEqual(result['status'],'refused');self.assertFalse(calls);self.assertEqual(mod.keybinds[0].key,'F5')

    def test_key_transport_types_and_shape_and_cancel(self):
        for value in ['', 'F 5', 'None', 'AnyKey', 'Invalid', 'F5;code', 'A'*129, 5, True, {}, []]:
            with self.subTest(value=value):
                _, _, mailbox = self.fixture()
                with self.assertRaises(Rejected):self.stage(mailbox,self.command(mailbox,'Toggle Third Person',value))
                self.assertFalse(mailbox.pending);self.assertFalse(calls)
        mod, registry, mailbox=self.fixture()
        self.stage(mailbox,self.command(mailbox,'Toggle Third Person','ThumbMouseButton'))
        self.assertEqual(mailbox.cancel(),1);self.assertFalse(calls);self.assertEqual(mod.keybinds[0].key,'F5')

    def test_real_http_stage_is_data_only_native_inventory_close_applies_once(self):
        harness = harness_module.Tests()
        with tempfile.TemporaryDirectory() as tmp, harness.runtime() as f:
            mod, _, _ = self.fixture(Path(tmp)/'mod.json')
            f.mod.keybinds=mod.keybinds;f.mod.options=mod.options
            f.mod.iter_display_options=mod.iter_display_options;f.mod.save_settings=mod.save_settings
            self.assertTrue(controller.start());session=controller._active
            harness.event(session,'apply',controller.OWN);mailbox=session.service.mailbox
            command=self.command(mailbox,'Dump Camera State','F10')
            status,_=harness.http(session.service,'/stage',dict(epoch=mailbox.epoch,queue_revision=0,commands=[command]))
            self.assertEqual(status,200);self.assertFalse(calls)
            harness.event(session,'release',controller.OWN);self.assertFalse(calls)
            harness.event(session,'release',controller.NAV);harness.event(session,'release',controller.NAV)
            self.assertEqual(calls,[(MAIN,'Dump Camera State','F10')])


if __name__=='__main__': unittest.main(verbosity=2)
