from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Run the original SDK factory, including real pyproject injection/registration.

Game services and the resulting Mod constructor are doubles; version parsing,
metadata priority and factory registration order execute the upstream code.
"""
from contextlib import contextmanager
from enum import Enum
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch
from version_guard import SOURCE, sdk_factory_source, literal_assignment, validate_distribution_versions


@contextmanager
def factory():
    namespace = '_sdk_factory_regression'
    package = ModuleType(namespace); package.__path__ = []
    created, registered = [], []
    modules = {namespace: package}
    def module(name, **attrs):
        item = ModuleType(namespace+'.'+name); item.__dict__.update(attrs)
        item.__package__ = namespace
        item.__file__ = str(SOURCE/'fixtures'/('sdk_'+name+'.py.txt'))
        modules[item.__name__] = item
        return item
    class Mod:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs); created.append(self)
    class Game(Enum): BL4 = 1
    class CoopSupport(Enum): ClientSide = 1
    class ModType(Enum): Standard = 1
    class BaseOption: pass
    class GroupedOption: pass
    class NestedOption: pass
    module('command', AbstractCommand=type('AbstractCommand', (), {}))
    module('dot_sdkmod', open_in_mod_dir=lambda path, binary=False: Path(path).open('rb' if binary else 'r'))
    module('hook', HookType=type('HookType', (), {}))
    module('keybinds', KeybindType=type('KeybindType', (), {}))
    module('mod', Mod=Mod, Game=Game, CoopSupport=CoopSupport, ModType=ModType)
    module('mod_list', mod_list=registered, register_mod=registered.append,
           deregister_mod=lambda mod: registered.remove(mod))
    module('options', BaseOption=BaseOption, GroupedOption=GroupedOption, NestedOption=NestedOption)
    module('settings', SETTINGS_DIR=Path('/unused-fixture-settings'))
    actual = module('mod_factory')
    with patch.dict(sys.modules, modules):
        exec(compile(sdk_factory_source(), '<original mods_base.mod_factory>', 'exec'), actual.__dict__)
        yield actual, created, registered


def register_with_project(factory_module, directory, project_text, display_version):
    path = Path(directory)/'__init__.py'
    (path.with_name('pyproject.toml')).write_text(project_text)
    caller = ModuleType('_sdk_version_registration_case')
    caller.__file__ = str(path)
    caller.build_mod = factory_module.build_mod
    caller.MOD_VERSION = display_version
    code = 'mod = build_mod(name="TPS fixture", version=MOD_VERSION, options=[], keybinds=[], hooks=[], commands=[])'
    with patch.dict(sys.modules, {caller.__name__: caller}):
        exec(compile(code, str(path), 'exec'), caller.__dict__)
    return caller


class Tests(unittest.TestCase):
    def test_release_versions_are_accepted_by_the_original_sdk_parser(self):
        result=validate_distribution_versions()
        self.assertEqual(result['echo'],'1.2.1')
        self.assertEqual(result['echo_version_info'],[1,2,1])
        self.assertEqual(result['example'],'1.0.0')
        with factory() as (sdk,created,registered),tempfile.TemporaryDirectory() as directory:
            register_with_project(sdk,directory,'[project]\nversion = "1.0.0"\n','1.0.0')
            self.assertEqual(len(registered),1)
    def test_unsupported_suffix_fails_before_sdk_registration(self):
        with factory() as (sdk,created,registered),tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                register_with_project(sdk,directory,'[project]\nversion = "1.0.0+suffix"\n','1.0.0+suffix')
            self.assertFalse(registered)

if __name__=='__main__':unittest.main()
