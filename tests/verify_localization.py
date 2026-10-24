"""The shipped language registry is shared by preferences and the UI build."""
from pathlib import Path
import json
import tempfile
import unittest
from test_bootstrap import prepare_package
prepare_package()
from bl4_echo_mod_menu.localization import LANGUAGES, LANGUAGE_CODES, valid_preference
from bl4_echo_mod_menu.menu.server import MenuService
from bl4_echo_mod_menu.menu.config import BUILD_TOKEN


class Tests(unittest.TestCase):
    def test_language_registry_has_fourteen_distinct_labels_and_regional_variants(self):
        self.assertEqual(len(LANGUAGE_CODES), 14)
        self.assertEqual(len({r['name'] for r in LANGUAGES}), 14)
        self.assertTrue({'es-es','es-419','pt-br','zh-hans','zh-hant'} <= LANGUAGE_CODES)
        self.assertTrue(all(r['name'] and r['code'] == r['code'].lower() for r in LANGUAGES))

    def test_all_languages_persist_and_reload_without_a_catalog_change(self):
        with tempfile.TemporaryDirectory() as directory:
            for code in ['auto', *(r['code'] for r in LANGUAGES)]:
                service = MenuService(port=0, directory=directory)
                try:
                    before = service.mailbox.snapshot()
                    status, response = service.receive_preferences({'token':BUILD_TOKEN,'language':code})
                    self.assertEqual(status,200)
                    self.assertEqual(response['preferences'],{'language':code})
                    self.assertEqual(service.mailbox.snapshot(),before)
                    self.assertEqual(json.loads(service.preferences_path.read_text()),{'language':code})
                finally:
                    service.stop()
                restored = MenuService(port=0,directory=directory)
                try:
                    self.assertEqual(restored.preferences,{'language':code})
                finally:
                    restored.stop()

    def test_preferences_reject_unknown_or_non_text_values(self):
        with tempfile.TemporaryDirectory() as directory:
            service = MenuService(port=0,directory=directory)
            try:
                for value in [None,[],{},True,17,'xx','zh','es-MX','EN']:
                    self.assertFalse(valid_preference(value))
                    self.assertEqual(service.receive_preferences({'token':BUILD_TOKEN,'language':value})[0],400)
                self.assertEqual(service.receive_preferences({'token':'wrong','language':'ja'})[0],403)
                self.assertEqual(service.preferences,{'language':'auto'})
            finally:
                service.stop()


if __name__ == '__main__': unittest.main()
