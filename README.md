# ECHO Mod Menu

A native Mods tab for Borderlands 4, with automatic SDK mod discovery, staged
settings, keyboard rebinding, language selection and controller navigation.

## Installation

Use the install package produced by **Build and test** under the repository's
Actions tab, or its [ready-to-install files](https://github.com/Maxunit/bl4_echo_mod_menu/tree/main/package).
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

### Language selection

Choose **Auto** to follow the game's text language, or open the adjacent dropdown
to select one of 14 languages by its native name. Spanish (Spain/Latin America)
and Chinese (Simplified/Traditional) have separate selections.

ECHO's own menu texts are translated into all 14 selectable languages.
Mod-provided translations use the selected language, with English fallback when
needed. This selection changes ECHO's language independently of the game.

Confirm opens the list. D-pad up/down navigates and scrolls within it; Confirm
applies the selection and Cancel closes the list without changing the language.
Mouse and virtual gamepad cursor selection are also supported.

Bundled TrueType fonts cover ECHO's translated menu text and language names,
including Latin, Cyrillic and the five Asian scripts. Windows language packs are
not required. Mod names, descriptions and option text remain supplied by each mod.

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

| Complete example | Demonstrates |
| --- | --- |
| [Level 2](examples/echo_menu_level2/__init__.py) | SDK-owned options, categories, presets, conditions and translated names/descriptions. |
| [Level 3](examples/echo_menu_level3/__init__.py) | Custom JSON loading/saving, validated callbacks, a queued Reset action and ordering. |
| [Combined](examples/echo_menu_example/__init__.py) | SDK options, a registered keybind and separate mod-owned persistence. |

The install package includes each source folder and a matching optional SDKMOD
under `examples/`. Copy only the example SDKMODs you want into `sdk_mods`.
These examples store settings and do not affect gameplay.

## Developer sources

The repository and separate `_sources.zip` contain the developer sources,
[build instructions](https://github.com/Maxunit/bl4_echo_mod_menu/blob/main/docs/BUILDING.md)
and [architecture notes](https://github.com/Maxunit/bl4_echo_mod_menu/blob/main/docs/ARCHITECTURE.md).
GitHub Actions builds and tests the packages on Windows and uploads the installer,
sources and checksums as one artifact.

## Runtime data and diagnostics

Mod values remain owned and saved by each mod. ECHO stores its own preferences
under the SDK settings directory, in `bl4_echo_mod_menu/preferences.json`.
Normal operation does not write full session reports. Set the process environment
variable `ECHO_MOD_MENU_DIAGNOSTICS=1` before startup to enable bounded diagnostic
files; errors can also produce reports. Runtime settings, logs and captures are
not part of this repository.

## Version

Current version: **1.2.4**, provider API **1**. See the
[changelog](CHANGELOG.md), [compatibility](COMPATIBILITY.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).
