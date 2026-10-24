"""Run the documented modules against original SDK factory/options/persistence.

Only the game-facing Mod class and archive resource boundary are modeled.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import partial
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile
import zipimport

from verify_keybinds import opts, settings
from verify_providers import command
from verify_versioning import factory
from bl4_echo_mod_menu.menu import catalog
from bl4_echo_mod_menu.menu.transactions import Mailbox
from build import build_examples


ROOT = Path(__file__).resolve().parent.parent


class ExampleMod(SimpleNamespace):
    """Game-facing owner; retain actual SDK option and persistence behavior."""

    def __init__(self, **fields: object) -> None:
        defaults = {
            "is_enabled": True,
            "enabling_locked": False,
            "options": [],
            "keybinds": [],
            "auto_enable": False,
            "description": "",
        }
        super().__init__(**(defaults | fields))
        for option in self.options:
            option.mod = self
        settings.default_load_mod_settings(self)

    def get_status(self) -> str:
        return "Enabled" if self.is_enabled else "Disabled"

    def iter_display_options(self) -> Iterator[object]:
        return iter(self.options)

    def save_settings(self) -> None:
        settings.default_save_mod_settings(self)


@contextmanager
def sample(
    name: str, directory: Path, archived: bool = False
) -> Iterator[tuple[ModuleType, list[object]]]:
    # The real SDK creates SETTINGS_DIR when its settings module imports.
    directory.mkdir(parents=True, exist_ok=True)
    with factory() as (sdk, _created, registered):
        base = ModuleType("mods_base")
        base.Game = sdk.Game
        base.SETTINGS_DIR = directory
        base.BoolOption = opts.BoolOption
        base.SliderOption = opts.SliderOption
        base.build_mod = partial(
            sdk.build_mod,
            cls=ExampleMod,
            settings_file=directory / (name + ".json"),
            keybinds=[],
            hooks=[],
            commands=[],
        )
        if archived:
            archives = build_examples(directory.parent / "archives")
            archive = next(path for path in archives if path.stem == name)

            def open_member(path: Path, binary: bool = False) -> object:
                try:
                    with zipfile.ZipFile(archive) as package:
                        data = package.read(path.relative_to(archive).as_posix())
                except KeyError as error:
                    raise FileNotFoundError(path) from error
                return io.BytesIO(data) if binary else io.StringIO(data.decode())

            sdk.open_in_mod_dir = open_member
            spec = zipimport.zipimporter(str(archive)).find_spec(name)
        else:
            spec = importlib.util.spec_from_file_location(
                name, ROOT / "examples" / name / "__init__.py"
            )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"mods_base": base, name: module}):
            spec.loader.exec_module(module)
            assert registered == [module.mod]
            yield module, registered


def registry_for(mods: list[object]) -> catalog.Registry:
    return catalog.Registry(SimpleNamespace(get_ordered_mod_list=lambda: mods))


def stage(registry: catalog.Registry, commands: list[dict]) -> Mailbox:
    box = Mailbox()
    box.open(registry.snapshot)
    box.stage({"epoch": box.epoch, "queue_revision": 0, "commands": commands})
    return box


class Tests(unittest.TestCase):
    def test_level2_real_sdk_callbacks_persistence_reload_and_fallback(self) -> None:
        for archived in (False, True):
            with self.subTest(archived=archived), tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp) / "settings"
                with sample("echo_menu_level2", directory, archived) as (module, mods):
                    changes = []
                    module.distance_option.on_change_anytime = (
                        lambda _option, value: changes.append(value)
                    )
                    registry = registry_for(mods)
                    row = registry.capture()["mods"][0]
                    self.assertEqual(row["integration"]["status"], "active")
                    distance = next(
                        entry for entry in row["options"]
                        if entry["identifier"] == "distance"
                    )
                    self.assertEqual(
                        (distance["min"], distance["max"], distance["step"]),
                        (60, 300, 10),
                    )
                    for entry in row["options"]:
                        self.assertTrue(entry["name_i18n"]["de"])
                        self.assertTrue(entry["description_i18n"]["de"])
                    self.assertEqual(len(row["categories"][0]["presets"]), 3)
                    box = stage(registry, [command(row, "distance", 200)])
                    self.assertEqual(module.distance_option.value, 150)
                    self.assertFalse(module.mod.settings_file.exists())
                    self.assertFalse(changes)
                    result = registry.apply(box.close()["commands"])
                    self.assertEqual(result["status"], "applied", result)
                    self.assertEqual(changes, [200])
                    stored = json.loads(module.mod.settings_file.read_text())
                    self.assertEqual(stored["options"]["distance"], 200)
                    del module.mod.echo_menu_provider
                    automatic = registry.capture()["mods"][0]
                    self.assertEqual(automatic["integration"]["status"], "automatic")
                    self.assertEqual(len(automatic["options"]), 2)
                with sample("echo_menu_level2", directory, archived) as (module, _mods):
                    self.assertEqual(module.distance_option.value, 200)

    def test_level3_staging_independent_custom_store_and_reload(self) -> None:
        for archived in (False, True):
            with self.subTest(archived=archived), tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp) / "settings"
                with sample("echo_menu_level3", directory, archived) as (module, mods):
                    registry = registry_for(mods)
                    row = registry.capture()["mods"][0]
                    self.assertEqual(row["integration"]["status"], "active")
                    box = stage(registry, [command(row, "custom_gain", 66)])
                    self.assertEqual(module.read_gain(), 25)
                    self.assertFalse(module.EXTRA_FILE.exists())
                    result = registry.apply(box.close()["commands"])
                    self.assertEqual(result["status"], "applied", result)
                    self.assertEqual(module.read_gain(), 66)
                    self.assertEqual(
                        json.loads(module.EXTRA_FILE.read_text()), {"gain": 66}
                    )
                    with self.assertRaises(ValueError):
                        module.write_gain(True)
                    self.assertEqual(module.read_gain(), 66)
                with sample("echo_menu_level3", directory, archived) as (module, _mods):
                    self.assertEqual(module.read_gain(), 66)

    def test_level3_queued_reset_runs_after_write_and_saves_final_state(self) -> None:
        for archived in (False, True):
            with self.subTest(archived=archived), tempfile.TemporaryDirectory() as tmp:
                with sample(
                    "echo_menu_level3", Path(tmp) / "settings", archived
                ) as (module, mods):
                    module.write_gain(40)
                    module.save_custom_settings()
                    registry = registry_for(mods)
                    row = registry.capture()["mods"][0]
                    box = stage(registry, [
                        command(row, "reset_gain", action=True),
                        command(row, "custom_gain", 77),
                    ])
                    self.assertEqual(module.read_gain(), 40)
                    self.assertEqual(
                        json.loads(module.EXTRA_FILE.read_text()), {"gain": 40}
                    )
                    result = registry.apply(box.close()["commands"])
                    self.assertEqual(result["status"], "applied", result)
                    self.assertEqual(len(result["completed"]), 2)
                    self.assertEqual(module.read_gain(), 25)
                    self.assertEqual(
                        json.loads(module.EXTRA_FILE.read_text()), {"gain": 25}
                    )

    def test_level3_invalid_custom_file_uses_default_without_rewriting_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            path = directory / "echo_menu_level3.extra.json"
            for contents in ("not JSON", "[]", '{"gain": true}', '{"gain": 101}'):
                with self.subTest(contents=contents):
                    path.write_text(contents)
                    with sample("echo_menu_level3", directory) as (module, _mods):
                        self.assertEqual(module.read_gain(), 25)
                        self.assertEqual(path.read_text(), contents)

    def test_full_documentation_blocks_match_the_executed_modules(self) -> None:
        text = (ROOT / "docs/API.md").read_text(encoding="utf-8")
        for level in (2, 3):
            section = text.split(f"## Level {level}: complete ", 1)[1]
            block = re.search(r"```python\n(.*?)\n```", section, re.S).group(1)
            source = ROOT / "examples" / f"echo_menu_level{level}" / "__init__.py"
            self.assertEqual(block, source.read_text(encoding="utf-8").rstrip())

    def test_example_archives_and_readable_sources_have_matching_roots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            archives = build_examples(output)
            self.assertEqual(
                {path.stem for path in archives},
                {"echo_menu_example", "echo_menu_level2", "echo_menu_level3"},
            )
            for archive in archives:
                with zipfile.ZipFile(archive) as package:
                    self.assertIsNone(package.testzip())
                    self.assertEqual(
                        {name.split("/")[0] for name in package.namelist()},
                        {archive.stem},
                    )
                    for name in package.namelist():
                        self.assertEqual(
                            package.read(name), (output / name).read_bytes()
                        )


if __name__ == "__main__":
    unittest.main()
