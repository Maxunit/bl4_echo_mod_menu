# Changelog

## 1.1.1 — selector font fix

- Bundle small, renamed Noto subsets for Japanese, Korean, Simplified Chinese,
  Traditional Chinese and Thai language names, with upstream OFL notices.
- Load the exact TrueType resources through local Cohtml font-face rules.
- Keep font registration across dropdown redraws and widget recreation.
- Check glyph coverage, font hashes and the packaged resource paths offline.

## 1.1.0 — language dropdown test

- Auto plus a scrollable language dropdown with 14 native language names.
- D-pad focus stays within the open list; Confirm applies and Cancel dismisses.
- Mouse, virtual gamepad cursor and keyboard input use the same selection.
- Regional locale mapping, saved preference reload and mod-text fallback.
- ECHO's own text remains English/German, with English fallback for other locales.

## 1.0.0

- Native Mods tab with a blank animated scene and native material transition.
- Automatic SDK mod/option/keybind discovery; optional provider API v1.
- Mod-owned advanced settings, actions, presets, translations and persistence.
- Staged Save & Apply, applied at native inventory close with ownership checks.
- Repeated numeric editing, real registered keybinds and keyboard capture.
- Visible D-pad focus, Confirm/Cancel, separate Minus/Slider/Plus targets and
  restored input registration across close/reopen and recreated widget instances.
- One SDKMOD, required tag INI and consistently named native PAK.
- English user and mod-author documentation; optional example mod.
- Separate developer sources with architecture and build documentation.
- Reproducible packaging and a Windows GitHub Actions build.
- Removed historical UI observers, unrelated build paths, private mod sources,
  personal-path provenance, old diagnostic archives and the unused static image.
- Versioned development symbols replaced with semantic UI names. Stable native
  compiled identifiers and native executable guards are retained deliberately.
- Full diagnostic file output is opt-in; settings persistence remains independent.
