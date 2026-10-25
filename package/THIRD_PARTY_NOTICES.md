# Third-party material

The menu's six TrueType font subsets derive from Noto Sans, JP, KR, SC, TC and
Thai, distributed under the SIL Open Font License 1.1. The modified font families
are named `ECHO Menu Font ...`. Upstream copyright/license
notices are retained in `licenses/fonts/`. `ui/fonts/manifest.json` records the
exact Fontsource repository commit, input blob identities and subset checksums.
These subsets cover the bundled ECHO translations and language names, with
additional Latin/Cyrillic characters. They are not complete Unicode fonts.
Source: https://github.com/fontsource/font-files

The `tests/fixtures/sdk_*.py.txt` files contain upstream `bl-sdk/mods_base` source
used only by offline tests. Their GNU LGPL v3 notice and associated license texts
are retained under `tests/fixtures/`. The factory fixture includes its exact
upstream blob identity. Upstream: https://github.com/bl-sdk/mods_base

The native UI base scripts, native input/menu test fixtures and compiled NCS
resources originate from Borderlands 4 game UI data. They remain subject to their
respective owners' rights. These files are build/test inputs and compatibility
resources, not an assertion of ownership of the game or its assets.

The PAK reader/writer implements the checked unencrypted, uncompressed v8 layout.
Its format references are the upstream `trumank/repak` entry/footer definitions:
https://github.com/trumank/repak/tree/master/repak/src

No project-wide license grant has been selected for ECHO-authored code in this
initial repository preparation. This notice does not change third-party licenses.

## Tabler interface icons

Twenty outline icons are copied from Tabler Icons v3.46.0, pinned to commit
`8ac7d81b72ece11072ef25ea9fd92e80c6f3c9fc`:
https://github.com/tabler/tabler-icons/tree/8ac7d81b72ece11072ef25ea9fd92e80c6f3c9fc

Their original SVG sources are under `ui/icons/`; cyan PNG derivatives are
bundled in ECHO's PAK. The complete MIT license is included at
`licenses/icons/Tabler-MIT.txt`. The ECHO mark is project-authored.
`src/bl4_echo_mod_menu/icons.json` records source/raster hashes and provenance.

The optional TPS artwork overlay includes the user-supplied transparent logo
unchanged. Its source manifest records the exact original bytes' SHA-256.
