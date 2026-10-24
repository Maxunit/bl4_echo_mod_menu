# Build and test

Requirements: Python 3.12+ and Node.js 24. No third-party pip/npm packages, game
installation, personal game configuration or exported session reports are needed.
Run these commands from the repository root on Windows:

```sh
python tools/checks.py
python tools/build.py
python tools/check_reproducible.py
```

Checks run the Python suites from source and again through an isolated SDKMOD.
They execute the upstream SDK keybind/options/settings/factory fixtures with
stubbed game services, real loopback HTTP, catalog preflight, example persistence,
archive imports, tag configuration and shutdown. Frontend fixtures exercise the
original game input managers/menu classes, field editing, capture, focus, scroll,
translations and provider declarations. Controller coverage includes the original
registered ListMenu lifecycle, repeated reopen cycles and instance replacement.

Artwork checks cover PNG structure/limits, folder and SDKMOD resources, package
ownership, exact-byte loopback transfer, stale requests and decorative focus
identity. Icons are committed PNGs; hashes, dimensions and original SVG sources
are checked without image-library dependencies. The optional TPS overlay is
validated against its pinned integration and unchanged logo hashes.

The native C++ boundary, physical input delivery, DOM geometry and Cohtml renderer
are modeled. Offline tests do not certify native execution or in-game pixels.

`tools/build.py` creates one SDKMOD with a matching package root, a checked PAK,
external tag INI, optional example SDKMODs, English docs and checksums. Outputs:

- `package/`: ready-to-install layout tracked for direct access.
- `dist/ECHO_Mod_Menu_<version>.zip`: complete install package.
- `dist/ECHO_Mod_Menu_<version>_sources.zip`: portable developer source tree,
  including the matching `package/` folder for a complete manual repository upload.
- `dist/SHA256SUMS.txt`: archive checksums.

Build instructions and architecture notes are included in the developer archive.
The install package includes the user guide, controls, compatibility, changelog,
third-party notices and mod-author/API documentation.

Each standalone folder under `examples/` is built into a matching SDKMOD and
also included as readable source in the install package. The API's complete
Level 2/3 code blocks match those source files. Tests import both forms using
the original SDK factory, options and persistence fixtures, while modeling the
game boundary.

ZIP timestamps, member order and permissions are fixed. The reproducibility
check extracts the source archive into a clean directory, runs the build and
compares both output archives byte-for-byte.

Each `ui/locales/<language-code>.json` contains all 88 menu strings. The build
requires one file per registered language, matching English keys and format
arguments. Mod-provided text uses the separate provider localization contract.

The build validates the committed menu font subsets and includes them in the
PAK. No font software or downloads are needed for normal builds. For optional
regeneration, `ui/fonts/manifest.json` lists each pinned upstream WOFF input and
the FontTools version. Download those files into one directory, install that
FontTools version, then run:

```sh
python tools/rebuild_language_fonts.py <input-directory>
```

The regeneration tool verifies the original Git blobs and requires byte-identical
subset outputs before replacing the committed fonts. OFL notices remain in
`licenses/fonts/` and are copied into the install package.

After an intentional translation change, missing glyphs fail the build. Update
the pinned input list if the new characters need more WOFF chunks, then regenerate
with `--update-manifest` and review the resulting font and manifest changes.
The glyph subsets follow ECHO's own shipped text; provider strings do not expand
them automatically.

GitHub Actions runs tests and builds on `windows-latest`, uploading the installer,
developer archive and checksums as `ECHO-Mod-Menu-Windows`. The workflow does not
publish a GitHub Release automatically and uses read-only repository permissions.
Diagnostic output is controlled separately from settings persistence with
`ECHO_MOD_MENU_DIAGNOSTICS=1` before process startup.
