from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Native tag dependency, clean install failure, and package completeness."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from test_bootstrap import prepare_package
prepare_package()
from bl4_echo_mod_menu.native_installation import (REQUIRED_TAGS, TAG_CONFIG,
    declared_tags, inspect_tag_config, require_tag_config)
from bl4_echo_mod_menu.menu import controller
from pak_codec import write_pak
from build import native_resources

SOURCE = Path(__file__).resolve().parent
CONTENTS = (SOURCE.parent/'native/BL4EchoModMenu.ini').read_bytes()


class Tests(unittest.TestCase):
    def install(self, root, contents=CONTENTS, legacy=False):
        path = root/TAG_CONFIG
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)
        return path

    def test_required_tags_match_independently_decoded_shipped_ncs(self):
        contract = json.loads((SOURCE/'fixtures/native_tag_contract.json').read_text())
        files = native_resources()
        for name, digest in contract['native_resources_sha256'].items():
            self.assertEqual(hashlib.sha256(files[name]).hexdigest(), digest)
        self.assertEqual(set(REQUIRED_TAGS), set(contract['state_applied_tags']+[contract['state_identity_tag']]))
        self.assertEqual(contract['nav_alt_required_tags'], contract['state_applied_tags'])
        self.assertTrue(set(contract['state_applied_tags']) <= set(contract['widget_required_tags']))
        self.assertEqual(contract['state_ident'], contract['primary_state'])
        self.assertEqual(declared_tags(CONTENTS.decode()), {name.casefold() for name in REQUIRED_TAGS})

    def test_clean_install_without_external_ini_fails_then_restoration_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'sdk_mods').mkdir()
            pak=root/'OakGame/Content/Paks/zzz_BL4_ECHO_Mod_Menu_999_P.pak'
            pak.parent.mkdir(parents=True)
            pak.write_bytes(write_pak(native_resources()))
            # A clean installation carries the native PAK and Python mod,
            # but also requires its tag INI. A PAK alone cannot satisfy it.
            missing=inspect_tag_config(root)
            self.assertEqual(missing['status'], 'incomplete')
            self.assertEqual(missing['missing_tags'], list(REQUIRED_TAGS))
            with patch.object(sys,'executable',str(root/'Borderlands4.exe')):
                with self.assertRaisesRegex(RuntimeError, 'tag config missing/incomplete'):
                    require_tag_config(root/'sdk_mods/menu.py')
                self.assertFalse((root/'OakGame/Config').exists())
                self.install(root)
                present=require_tag_config(root/'sdk_mods/menu.py')
            self.assertEqual(present['status'], 'declared_on_disk')
            self.assertFalse(present['runtime_import_verified'])

    def test_wrong_section_comment_and_one_tag_do_not_satisfy_dependencies(self):
        samples = [b'[OtherSection]\n'+CONTENTS.split(b'\n',1)[1],
                   b'[/Script/GameplayTags.GameplayTagsList]\n;'+CONTENTS.split(b'\n',1)[1].replace(b'\n',b'\n;'),
                   b'\n'.join(CONTENTS.splitlines()[:2])+b'\n']
        for contents in samples:
            with self.subTest(contents=contents), tempfile.TemporaryDirectory() as directory:
                root=Path(directory); self.install(root, contents)
                result=inspect_tag_config(root)
                self.assertEqual(result['status'], 'incomplete')
                self.assertTrue(result['missing_tags'])

    def test_bom_and_unreal_array_plus_entries_are_recognized(self):
        contents=b'\xef\xbb\xbf'+CONTENTS.replace(b'GameplayTagList=',b'+GameplayTagList=').replace(b'\n',b'\r\n')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); path=self.install(root, contents)
            result=inspect_tag_config(root)
            self.assertEqual(result['status'], 'declared_on_disk')
            self.assertEqual(result['files'][0]['path'],TAG_CONFIG)
            self.assertEqual(path.read_bytes(), contents)
            self.assertTrue((root/TAG_CONFIG).exists())

    def test_missing_config_refuses_start_before_scene_hooks_or_catalog(self):
        logs=[]
        sdk=SimpleNamespace(logging=SimpleNamespace(error=logs.append))
        scene=SimpleNamespace(_active=None,start=Mock(side_effect=AssertionError('Native scene touched')))
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'sdk_mods').mkdir(); (root/'OakGame/Content/Paks').mkdir(parents=True)
            with patch.object(sys,'executable',str(root/'Borderlands4.exe')), patch.object(controller,'_active',None), \
                    patch.dict(sys.modules,{'unrealsdk':sdk,'bl4_echo_mod_menu.scene.lifecycle':scene}):
                self.assertFalse(controller.start(root/'sdk_mods/menu.py'))
            scene.start.assert_not_called()
            self.assertTrue(any(TAG_CONFIG in line for line in logs))
            self.assertFalse((root/'sdk_mods/settings').exists())

    def test_release_builder_always_copies_the_native_config_outside_sdkmod(self):
        import build
        with tempfile.TemporaryDirectory() as directory, patch.object(build,'PACKAGE',Path(directory)):
            report=build.write_native_tag_config()
            self.assertEqual((Path(directory)/TAG_CONFIG).read_bytes(), CONTENTS)
            self.assertEqual(report['status'], 'declared_on_disk')
            self.assertFalse(report['runtime_import_verified'])


if __name__=='__main__': unittest.main(verbosity=2)
