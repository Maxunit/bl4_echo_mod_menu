# Connecting a mod to ECHO

ECHO's API is an optional extension on a registered `mods_base.Mod`. Your mod owns
its settings and keeps working when ECHO is absent. You do not import ECHO.

## 1. Standard SDK integration

Register ordinary SDK options and real keybind objects with `build_mod`. ECHO
discovers them automatically, including their live values, defaults and bounds.
Hidden options remain hidden. No extra integration file is needed.

```python
from mods_base import BoolOption, Game, build_mod

feature = BoolOption('feature_enabled', True, display_name='Enable feature')
mod = build_mod(name='Example Mod', author='Example author', version='1.0.0',
                supported_games=Game.BL4, options=[feature])
```

## 2. Optional presentation

After registration, attach one stable dictionary:

```python
mod.echo_menu_provider = {
    'api_version': 1,
    'id': 'example.feature',
    'revision': 1,
    'categories': [{'id': 'features',
                    'name': {'en': 'Features', 'de': 'Funktionen'}}],
    'options': [{'id': 'feature_enabled', 'option': feature,
                 'category': 'features',
                 'name': {'en': 'Enable feature', 'de': 'Funktion aktivieren'}}],
}
```

Reference your actual visible SDK option objects. Their values, ranges and SDK
callbacks remain authoritative. Optional metadata adds categories, ordering,
units, presets, conditions and translated labels. Actual registered keybinds use
`keybind` references and stay in the dedicated Keybinds category.

## 3. Advanced mod-owned values

For settings outside normal SDK options, declare `settings` with your own `read`,
optional `validate`, `write` and `save` callbacks. Actions provide `run`. Preserve
your native/build/thread/ownership checks. ECHO validates plain data, stages a
draft and invokes your callbacks on the guarded game thread at inventory close.
HTTP workers never execute mod callbacks.

Use stable IDs and keep the declaration/callbacks stable during an open inventory
session. Replacement/reload invalidates old drafts. A callback can partially
change state before failing; design for the documented partial-failure behavior.

Read the full [API v1 specification](API.md), especially applying/saving,
registration/reload and fallback rules. The complete runnable
[example](../examples/echo_menu_example/__init__.py) demonstrates both standard
SDK persistence and a separate JSON store owned by the example itself.
