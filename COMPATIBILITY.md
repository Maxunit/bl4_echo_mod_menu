# Compatibility

## Reviewed native profile

| Component | Validated profile |
| --- | --- |
| Game/store | Borderlands 4, Steam, update 1.11 |
| Platform | Windows x64 |
| PE timestamp | `0xf38df04c` |
| Image size | `0x26e12000` |
| ASLR-normalized header SHA-256 | `6e5eca4680798f2dceda4df9c6a87ddc9323dc67ed9e6d645384d66fc16c7719` |
| SDK runtime used for the functional baseline | unrealsdk 3.2.0, pyunrealsdk 1.10.0, BL4-compatible mods_base |
| ECHO provider API | 1 |

The Python native bridge checks executable identity, guarded instruction bytes,
reflected function signatures, pointer bounds, game-thread identity and request
ownership before calling native entry points. ASLR is accounted for. Install
paths are discovered; no particular drive or account folder is required.

A different executable is not approved merely because its displayed game version
also says 1.11. Epic and later updates have not been validated.
New profiles require a fresh native review; do not bypass the checks.

The PAK is mounted by the game before Python can reject a native profile. The
Python guard does not validate an incompatible mounted PAK. Install the complete
mod only on the reviewed profile; remove its SDKMOD, PAK and tag INI to uninstall.

## Linux / Proton

Linux use requires running the Windows game and SDK through Proton, such as
Proton Experimental. This environment has not been validated for ECHO.

## SDK and mod integrations

The game must have a BL4-compatible PythonSDK providing `unrealsdk` and
`mods_base`. ECHO uses registered mod/option/keybind objects and supports the SDK's
Library registration. The SDK owns the interpreter and settings root.

An optional provider cannot make locked or unsupported SDK options writable.
Advanced values retain the owning mod's own build, thread and lifetime checks.
A malformed provider falls back for that mod; it does not authorize native work.

## Validation boundary

The 1.2.4 functional baseline passed in-game installation/autostart, editable options,
keybind capture/rebinding, save-and-restart persistence, native inventory/pause
menus, multilingual text rendering, language switching, D-pad/Confirm/Cancel,
slider editing and bottom-to-top navigation through the camera presets.
Screen formats and controller hardware beyond the tested setup are
not implied by the offline DOM fixtures.


Version 1.3.0 extends that 1.2.4 baseline with decorative icons and optional PNG
artwork. Its first in-game screenshots exposed misplaced icons, an overflowing
language toolbar and distorted headers. Version 1.3.1 corrects those layouts
without CSS `order` or `object-fit`, which Cohtml does not support. The user's
1.3.1 in-game screenshot confirms the corrected icon placement, language toolbar
and proportional TPS logo. The user also confirmed 1.3.2's centered placement.
Version 1.3.3 moves the retained mod header above category tabs and removes the
duplicate category heading. The new layout has offline coverage and still
requires in-game visual validation.
Offline geometry remains modeled.
The optional TPS overlay is pinned to the integration in the v100.3 bundle.
