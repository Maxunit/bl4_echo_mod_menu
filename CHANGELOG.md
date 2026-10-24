# Changelog

## 1.0.0 — publication preparation

- Native Mods tab with a blank animated scene and native material transition.
- Automatic SDK mod/option/keybind discovery; optional provider API v1.
- Mod-owned advanced settings, actions, presets, translations and persistence.
- Staged Save & Apply, applied at native inventory close with ownership checks.
- Repeated numeric editing, real registered keybinds and keyboard capture.
- Visible D-pad focus, Confirm/Cancel, separate Minus/Slider/Plus targets and
  restored input registration across close/reopen and recreated widget instances.
- One SDKMOD, required tag INI and consistently named native PAK.
- English user, author, API, architecture and build documentation; optional example.
- Reproducible build and Linux/Windows GitHub Actions artifacts.
- Removed historical UI observers, unrelated build paths, private mod sources,
  personal-path provenance, old diagnostic archives and the unused static image.
- Versioned development symbols replaced with semantic UI names. Stable native
  compiled identifiers and native executable guards are retained deliberately.
- Full diagnostic file output is opt-in; settings persistence remains independent.

The core functional baseline was accepted in game. This source/publication cleanup
has offline regression coverage and still needs a final in-game smoke test.
