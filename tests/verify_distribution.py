from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Archive-only imports, SDK discovery rules, resource access and writable paths."""
import contextlib
import importlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

from package_build import MODULE, write_sdkmod
SOURCE = Path(__file__).resolve().parent
from test_bootstrap import prepare_package
prepare_package()
from bl4_echo_mod_menu.paths import locate_game_root, settings_directory, report_directory


class Tests(unittest.TestCase):
    def game(self, directory):
        root = Path(directory)/'Borderlands 4'
        (root/'sdk_mods').mkdir(parents=True)
        (root/'OakGame/Content/Paks').mkdir(parents=True)
        config=root/'OakGame/Config/Tags/BL4EchoModMenu.ini'
        config.parent.mkdir(parents=True)
        config.write_bytes((SOURCE.parent/'native/BL4EchoModMenu.ini').read_bytes())
        return root

    def test_official_loader_accepts_sdkmod_and_rejects_wrong_roots(self):
        errors=[]
        scope={'Path': Path, 'contextlib': contextlib, 'zipfile': zipfile,
            'sys': SimpleNamespace(path=[]), 'logging': SimpleNamespace(error=errors.append, dev_warning=errors.append),
            'RE_NUMBERED_DUPLICATE': re.compile(r'^(.+?) ?\(\d+\)\.sdkmod$', flags=re.I)}
        source=(SOURCE/'fixtures/sdk_loader_validation.py.txt').read_text()
        exec(compile(source, '<official BL4 loader validation>', 'exec'), scope)
        validate=scope['validate_file_in_mods_folder']
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            archive=write_sdkmod(root/'bl4_echo_mod_menu.sdkmod')
            self.assertTrue(validate(archive))
            self.assertEqual(scope['sys'].path, [str(archive)])
            renamed=root/'wrong_name.sdkmod';renamed.write_bytes(archive.read_bytes())
            self.assertFalse(validate(renamed))
            extra=root/'extra.sdkmod'
            with zipfile.ZipFile(extra,'w') as z:
                z.writestr('extra/__init__.py','');z.writestr('other/__init__.py','')
            self.assertFalse(validate(extra))

    def run_distribution(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            game=self.game(directory)
            if mode=='sdkmod':
                target=write_sdkmod(game/'sdk_mods/bl4_echo_mod_menu.sdkmod')
            else:
                shutil.copytree(MODULE, game/'sdk_mods/bl4_echo_mod_menu', ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
                target=game/'sdk_mods'
            run=subprocess.run([sys.executable,'-I',str(SOURCE/'archive_smoke.py'),str(target),str(game),mode],
                cwd=directory,text=True,capture_output=True,timeout=30)
            self.assertEqual(run.returncode,0,run.stdout+'\n'+run.stderr)
            result=json.loads(run.stdout.strip().splitlines()[-1])
            self.assertEqual(result['format'],mode)
            self.assertTrue(result['complete_import'])
            self.assertTrue(result['outside_archive_persistence'])
            self.assertFalse(result['game_runtime_tested'])

    def test_archive_only_full_import_and_native_close_flow(self):
        self.run_distribution('sdkmod')

    def test_folder_full_import_and_native_close_flow(self):
        self.run_distribution('folder')

    def test_paths_follow_real_game_and_sdk_settings_outside_package(self):
        with tempfile.TemporaryDirectory() as directory:
            game=self.game(directory)
            outside=Path(directory)/'external mods'
            archive=outside/'bl4_echo_mod_menu.sdkmod/bl4_echo_mod_menu/lifecycle.py'
            executable=game/'OakGame/Binaries/Win64/Borderlands4.exe'
            with patch.object(sys,'executable',str(executable)):
                self.assertEqual(locate_game_root(archive,working_directory=outside),game)
            declared=game/'sdk_mods/settings'
            with patch.dict(sys.modules,{'mods_base':SimpleNamespace(SETTINGS_DIR=declared)}):
                self.assertEqual(settings_directory(),declared)
                self.assertEqual(report_directory(),declared/'bl4_echo_mod_menu')
            self.assertFalse(declared.exists())

    def test_missing_installation_is_rejected_without_creating_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch.object(sys,'executable',str(root/'not_game.exe')):
                with self.assertRaises(RuntimeError):
                    locate_game_root(root/'bl4_echo_mod_menu.sdkmod/mod/__init__.py',working_directory=root)
            self.assertEqual(list(root.iterdir()),[])


if __name__ == '__main__': unittest.main(verbosity=2)
