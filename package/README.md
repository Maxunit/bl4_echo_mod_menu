# ECHO Mod Menu

A native Mods tab for Borderlands 4, with automatic SDK mod discovery, staged
settings, keyboard rebinding, English/German text and controller navigation.

## Installation

Use the install package produced by **Build and test** under this repository's
Actions tab, or the ready-to-install files in [`package/`](package/).
Exit the game, then copy these files into the **Borderlands 4 installation root**:

| File | Destination relative to the game root |
| --- | --- |
| SDK mod | `sdk_mods/bl4_echo_mod_menu.sdkmod` |
| Native UI PAK | `OakGame/Content/Paks/zzz_BL4_ECHO_Mod_Menu_999_P.pak` |
| Required tag configuration | `OakGame/Config/Tags/BL4EchoModMenu.ini` |

Keep the SDKMOD filename unchanged and restart the game completely. The INI is
required: Unreal imports its tag definitions at startup. A BL4-compatible
PythonSDK installation with `unrealsdk` and `mods_base` is required.

The mod starts automatically when the inventory is first activated. Open the
inventory and select **Mods**. No console/PyExec activation is needed.

The current native profile is **Steam, Windows x64, game update 1.11**, restricted
to the reviewed executable fingerprint. Read [compatibility](COMPATIBILITY.md)
before installing on a different executable or storefront.

## Using the menu

ECHO discovers registered SDK mods, their visible options and their actual
registered keybinds. Authors can optionally supply categories, presets,
translations and additional settings through [API v1](docs/API.md).

- Edit values locally, then choose **Save & Apply** to queue the complete draft.
- Close the inventory to apply and save queued changes through their owning mods.
- Changing to another tab does not apply the draft.
- **Discard draft** restores the queued values. Clearing the queue removes the
  pending commands. Validation errors must be corrected before saving.
- Changing the menu language preserves the current draft. Mod descriptions are
  translated only when their author supplies translations.

Keyboard capture supports individual supported keyboard keys. It does not add
an on-screen keyboard or physical gamepad-button rebinding.

### Controller

Use the game's logical navigation/Confirm/Cancel bindings. With the usual
DualSense layout, Confirm is Cross and Cancel is Circle.

- D-pad moves between mods, categories, options and footer actions.
- Numeric rows expose separate **Minus / Slider / Plus** targets.
- Confirm on a slider or choice begins the orange edit mode. Left/right changes
  the value; Confirm keeps it and Cancel restores the value before that edit.
- Cancel ends active text entry/capture first. Outside an edit, native Back runs.
- Move the mouse or gamepad cursor to resume cursor operation.

See [controls](docs/CONTROLS.md) for focus, capture and cancellation details.

## Mod authors

Ordinary SDK mods need no ECHO dependency or integration file. Start with the
[author guide](docs/MOD_AUTHORS.md), then use the full [API reference](docs/API.md).
The [example source](examples/echo_menu_example/__init__.py) demonstrates standard
options, real keybinds, translated metadata, a preset and mod-owned persistence.
The optional built example is `package/examples/echo_menu_example.sdkmod`; copy it
into `sdk_mods` only when wanted. It does not affect gameplay.

## Building

Build requirements: Python 3.12+ and Node.js 24. No pip/npm packages or game
installation are required for the offline build and tests.

```sh
python tools/checks.py
python tools/build.py
python tools/check_reproducible.py
```

Install files are placed in `package/`. `dist/` contains the installer ZIP,
separate developer-source ZIP and checksums. GitHub Actions builds and tests on
Linux and Windows and uploads these files as artifacts. It does not publish a
GitHub Release automatically.

[Architecture](docs/ARCHITECTURE.md) explains thread/ownership boundaries;
[build and tests](docs/BUILDING.md) documents what offline checks can establish.

## Runtime data and diagnostics

Mod values remain owned and saved by each mod. ECHO stores its own preferences
under the SDK settings directory, in `bl4_echo_mod_menu/preferences.json`.
Normal operation does not write full session reports. Set the process environment
variable `ECHO_MOD_MENU_DIAGNOSTICS=1` before startup to enable bounded diagnostic
files; errors can also produce reports. Runtime settings, logs and captures are
not part of this repository.

## Status

Version **1.0.0** is the initial publication-preparation package. Its functional
baseline was tested in game for installation, autostart, settings/keybind
persistence across restart, native menus, languages and controller operation.
The cleaned publication bundle changes source layout and diagnostics and needs
its own final in-game smoke test. Offline tests cannot execute Cohtml or native
Win64 calls. See [changelog](CHANGELOG.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
