# Connecting a mod to ECHO

ECHO discovers registered PythonSDK mods automatically. Its optional provider
API adds presentation metadata or exposes mod-owned settings. Your mod imports
`mods_base` and keeps owning its data; it never needs to import ECHO.

## Choose the smallest integration you need

| Need | Level | Start here |
| --- | --- | --- |
| Show ordinary SDK options and registered keybinds | 1: automatic | Register them normally; no ECHO-specific code. |
| Add categories, presets, units, conditions or translations | 2: presentation | [Complete Level 2 example](API.md#level-2-complete-sdk-presentation-example). |
| Expose settings outside SDK options or custom actions | 3: callbacks | [Complete Level 3 example](API.md#level-3-complete-mod-owned-settings-example). |

One provider can mix Levels 2 and 3. You do not need to migrate working SDK
options into custom callbacks just to translate them or put them in a category.

## Level 1 needs no declaration

This entire SDK mod already works with ECHO:

```python
from mods_base import BoolOption, Game, build_mod

feature = BoolOption(
    "feature_enabled", True, display_name="Enable feature"
)
mod = build_mod(
    name="Example Mod",
    author="Example author",
    version="1.0.0",
    supported_games=Game.BL4,
    options=[feature],
)
```

Register real keybind objects in the SDK's `keybinds` list. Hidden SDK options
remain hidden; unsupported types stay read-only when representable.

## Try the complete examples

The install package contains readable source and these optional SDKMODs under
`examples/`. Copy a chosen SDKMOD into `sdk_mods`, restart the game and enable
the example if needed. The examples change their own settings only.

| SDKMOD | What to inspect |
| --- | --- |
| `echo_menu_level2.sdkmod` | Creation and registration of two SDK options; one stable provider dictionary; three presets; English/German names and descriptions. |
| `echo_menu_level3.sdkmod` | Custom JSON loading, pure reads, validation, writes, saving, a queued Reset action and explicit ordering. |
| `echo_menu_example.sdkmod` | A combined mod with SDK options, an actual registered keybind and a separate custom store. |

The full Level 2/3 files are reproduced in [API.md](API.md). Nothing is left as
an undefined option or callback. You can also use the supplied source folders
directly; install either the folder or its SDKMOD, not both for the same example.

## Adapt an existing mod

1. Keep your SDK registration and existing feature logic. Reference the exact
   registered option or keybind objects, rather than copies or ID strings.
2. After `build_mod` returns, assign one stable `mod.echo_menu_provider`
   dictionary with `api_version: 1` and your own stable namespace.
3. Translate each desired field separately, including both option names and
   descriptions. Values and IDs remain independent of the selected language.
4. For Level 3, bind your existing getters, authoritative validators/setters
   and persistence function. Load custom files yourself during initialization.
   Include a top-level `save` callback for writable values and actions.
5. Keep the declaration and callbacks unchanged during an open inventory
   session. Reopen after a provider reload or revision change.

The complete schema, allowed fields, presets, conditions, ordering, language
fallback and keybind rules are in the [API reference](API.md).

## Know when a change reaches your mod

Editing changes an ECHO draft. **Save & Apply queues that draft. Closing the
inventory applies it.** Switching native tabs does not apply it. The same rule
applies to actions: choosing Run queues the action; it does not execute it yet.

SDK values use normal SDK assignment and `mod.save_settings()`. Custom values
use your write callback and custom saver, followed by SDK persistence. ECHO never
edits a foreign settings JSON directly. If an action changes another setting,
define its order relative to queued writes, as the Level 3 example does.

Callbacks run on the menu's guarded game thread. Reads, validators and ordering
must be side-effect-free. Preserve your feature's own native/build/thread/world
and ownership checks. A callback can partially change state before failing;
there is no automatic rollback guarantee.

## Check your integration

Verify language changes preserve values, Save & Apply alone does not run your
setter, inventory close applies the change, and a restart restores it. For a
custom action, verify its ordering and saved result. Removing the provider
attribute should leave your ordinary SDK options available automatically.

See [troubleshooting](API.md#troubleshooting-an-integration) for fallback status,
missing translations, read-only settings and stale drafts after a reload.
