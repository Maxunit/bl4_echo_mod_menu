from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Automatic inventory startup using real controller/HTTP service and SDK hook fixtures."""
import ast
import importlib
import importlib.util
from pathlib import Path
import sys
import tempfile
from threading import Thread, get_ident
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import verify_catalog as catalog_tests
from bl4_echo_mod_menu.menu import controller

ROOT = Path(__file__).resolve().parent.parent
ENTRY = ROOT/'src/bl4_echo_mod_menu'
auto = importlib.import_module('bl4_echo_mod_menu.lifecycle')


def native_class():
    def prop(name, kind):
        return type(kind, (), {'Name':name, 'PropertyFlags':0x80})()
    field = type('UFunction', (), {
        'NumParams':2, '_path_name':lambda self:auto.BOOT_PATH,
        '_properties':lambda self:iter([prop('WorldContextObject','ZObjectProperty'),prop('OwningWidgetDef','ZGbxDefPtrProperty')]),
    })()
    return SimpleNamespace(_path_name=lambda:auto.BOOT_CLASS, _fields=lambda:iter([field]))


class Tests(unittest.TestCase):
    runtime = catalog_tests.Tests.runtime
    registry = catalog_tests.Tests.registry

    def setup_auto(self):
        auto._enabled=auto._installed=auto._busy=auto._failed=False
        auto._game_thread=None
        sdk=sys.modules['unrealsdk'];sdk.find_class=lambda name:native_class()
        return sdk

    def event(self,name=controller.NAV,cls=controller.SCRIPT_CLASS):
        return auto.on_activate(SimpleNamespace(Class=SimpleNamespace(_path_name=lambda:cls)),
            SimpleNamespace(OwningWidgetDef=SimpleNamespace(_name=name)))

    def test_waits_for_inventory_then_starts_once_on_callback_thread(self):
        with self.runtime() as f:
            self.setup_auto()
            self.assertTrue(auto.enable());self.assertTrue(auto.enable())
            self.assertIsNone(controller._active);self.assertEqual(f.calls,[])
            self.assertEqual(len(f.hooks.rows),1)
            self.event('main_menu');self.event(controller.NAV,'foreign_class')
            self.assertIsNone(controller._active);self.assertEqual(f.calls,[])
            self.event();self.assertIsNotNone(controller._active)
            self.assertEqual(controller._active.thread,get_ident())
            self.assertFalse(auto._installed);self.assertEqual(len(f.hooks.rows),4)
            before=len(f.services);self.event();self.assertTrue(auto.enable())
            self.assertEqual(len(f.services),before)
            outcomes=[];t=Thread(target=lambda:outcomes.append(auto.stop()));t.start();t.join()
            self.assertEqual(outcomes,[False]);self.assertTrue(auto.stop())
            self.assertFalse(f.hooks.rows);self.assertTrue(all(t==get_ident() for t in f.calls))

    def test_stop_while_waiting_and_enable_again(self):
        with self.runtime() as f:
            self.setup_auto();self.assertTrue(auto.enable());self.assertTrue(auto.stop())
            self.event();self.assertIsNone(controller._active);self.assertFalse(f.hooks.rows)
            self.assertTrue(auto.enable());self.event();self.assertTrue(auto.stop())

    def test_sdk_second_add_false_and_preexisting_identifier_not_removed(self):
        with self.runtime() as f:
            sdk=self.setup_auto();foreign=lambda *args:None
            f.hooks.add_hook(auto.BOOT_PATH,1,'unrelated',foreign)
            self.assertTrue(auto.enable());self.assertTrue(auto.stop())
            self.assertEqual(list(f.hooks.rows.values()),[foreign])
            f.hooks.add_hook(auto.BOOT_PATH,1,auto.HOOK_ID,foreign)
            self.assertFalse(auto.enable())
            self.assertIs(f.hooks.rows[(auto.BOOT_PATH,1,auto.HOOK_ID)],foreign)
            f.hooks.remove_hook(auto.BOOT_PATH,1,auto.HOOK_ID)

    def test_fail_closed_then_manual_rearm_no_event_retry_loop(self):
        with self.runtime() as f:
            self.setup_auto();self.assertTrue(auto.enable())
            with patch.object(controller,'start',return_value=False) as start:
                self.event();self.event();self.assertEqual(start.call_count,1)
            self.assertTrue(auto._failed);self.assertTrue(auto.enable())
            self.event();self.assertIsNotNone(controller._active);self.assertTrue(auto.stop())

    def test_signature_change_rejects_before_hook_or_controller(self):
        with self.runtime() as f:
            sdk=self.setup_auto();sdk.find_class=lambda name:None
            self.assertFalse(auto.enable());self.assertFalse(f.hooks.rows)
            self.assertEqual(f.calls,[])

    def test_sdk_entry_registers_always_enabled_library_before_any_scene_work(self):
        text=(ENTRY/'__init__.py').read_text();ast.parse(text)
        with self.runtime() as f:
            sdk=self.setup_auto();fields={}
            def build_mod(**kwargs):
                fields.update(kwargs)
                kwargs['on_enable']()  # Library constructor invokes this before assignment.
                return SimpleNamespace(enabling_locked=True,is_enabled=True)
            package=SimpleNamespace(__path__=[str(ENTRY)])
            base=SimpleNamespace(Game=SimpleNamespace(BL4='BL4'),Library=object,build_mod=build_mod)
            with patch.dict(sys.modules,{'mods_base':base,'bl4_echo_mod_menu':package,'bl4_echo_mod_menu.lifecycle':auto}):
                ns={'__name__':'bl4_echo_mod_menu','__package__':'bl4_echo_mod_menu'}
                exec(compile(text,str(ENTRY/'__init__.py'),'exec'),ns)
            self.assertIs(fields['cls'],object);self.assertEqual(fields['hooks'],[])
            self.assertTrue(auto._installed);self.assertEqual(f.calls,[])
            self.assertIsNone(controller._active);self.assertTrue(auto.stop())

    def test_scene_hook_install_checks_presence_even_when_add_returns_false(self):
        import importlib
        scene=importlib.import_module('bl4_echo_mod_menu.scene.lifecycle')
        with self.runtime() as f:
            sdk=self.setup_auto();details={'widget_name_value':'01','scene_name_value':'02'}
            definitions=[{'path':'/Scene:Activate','mode':'apply'},{'path':'/Scene:Deactivate','mode':'release'}]
            for row in definitions:f.hooks.add_hook(row['path'],1,'other_scene_user',lambda *args:None)
            with tempfile.TemporaryDirectory() as directory:
                session=scene.Session(sdk,object(),Path(directory)/'scene.json',lambda *args:None)
                with patch.object(scene,'prepare',return_value=(details,[SimpleNamespace()])),patch.object(scene,'validate'),patch.object(scene,'context',return_value={}),patch.object(scene,'hook_metadata',return_value=definitions):
                    session.start()
                self.assertTrue(session.enabled);self.assertEqual(len(session.installed),2)
                session.remove_hooks()
                self.assertEqual(len(f.hooks.rows),2)


if __name__=='__main__':unittest.main(verbosity=2)
