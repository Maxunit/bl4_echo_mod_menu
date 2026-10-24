# Build and test

Requirements: Python 3.12+ and Node.js 24. No third-party pip/npm packages, game
installation, personal game configuration or exported session reports are needed.

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

The native C++ boundary, physical input delivery, DOM geometry and Cohtml renderer
are modeled. Offline tests do not certify native execution or in-game pixels.
The cleaned publication bundle needs its final in-game smoke test.

`tools/build.py` creates one SDKMOD with a matching package root, a checked PAK,
external tag INI, optional example SDKMOD, English docs and checksums. Outputs:

- `package/`: ready-to-install layout tracked for direct access.
- `dist/ECHO_Mod_Menu_<version>.zip`: complete install package.
- `dist/ECHO_Mod_Menu_<version>_sources.zip`: portable developer source tree.
- `dist/SHA256SUMS.txt`: archive checksums.

ZIP timestamps, member order and permissions are fixed. The reproducibility
check extracts the source archive into a clean directory, runs the build and
compares both output archives byte-for-byte.

GitHub Actions runs tests/build on Linux and Windows. Artifacts are uploaded per
platform; no automatic release publishing or repository write token is needed.
Diagnostic output is controlled separately from settings persistence with
`ECHO_MOD_MENU_DIAGNOSTICS=1` before process startup.
