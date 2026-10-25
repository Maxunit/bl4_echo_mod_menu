# Changelog

## 1.3.3 — mod banner above category tabs (in-game test build)

- Move the selected mod's centered logo above its category tabs, outside the
  settings scroll pane. Retain the same image node when changing categories.
- Show a compact localized mod-name heading when artwork is absent, rejected
  or fails to load/decode, without leaving an empty banner-sized gap.
- Start category content directly with its notices, presets and settings;
  remove the duplicate category/Information heading.
- Keep the visible-option counter beside the tabs, hiding it on Information.
- Preserve per-category scrolling, drafts, presets, controller targets and the
  existing input/lifecycle routes. Keep the TPS PNG and overlay unchanged.
- Extend offline coverage for header order/identity, scrolling, compact name
  fallbacks, empty selections and stale image responses. In-game visual
  validation of the new layout remains required.

## 1.3.2 — centered mod headers

- Center header logos horizontally within the available artwork area while
  preserving proportional sizing, transparency and original PNG bytes.
- Retain centered placement through the existing resize/layout events.

## 1.3.1 — Cohtml icon layout and proportional artwork (in-game test build)

- Place mod icons directly to the left of mod names with a reserved icon slot
  and spacing, preserving card height and controller targets.
- Place category and action icons before explicit text labels in DOM order;
  remove unsupported CSS `order` from the UI.
- Bound the heading width and anchor the language toolbar to the header's right
  edge, preventing its controls from being pushed beyond the screen.
- Fit headers using validated PNG dimensions and the measured content area,
  replacing unsupported `object-fit` with explicit proportional image sizes.
- Keep non-square custom mod icons proportional in the same reserved slot.
- Refit headers on existing layout/resize/image events without timers or polling.
- Preserve the supplied TPS PNG and the optional TPS overlay byte-for-byte.
- Extend offline regressions for DOM order, language toolbar constraints,
  resize/deferred layout, image proportions and icon fallbacks. BL4 pixel
  validation of this correction is still required.

## 1.3.0 — icons and optional mod artwork (in-game test build)

- Bundle 20 pinned Tabler icons and an ECHO mark as PNG resources, with their
  original SVG sources and MIT attribution. Normal builds stay dependency-free.
- Add decorative mod/category/language/action icons without new focus targets.
- Support optional `mod.echo_menu_artwork` independently of provider API v1,
  including built-in or PNG mod icons, category icons and PNG headers.
- Read bounded resources from already loaded folder/SDKMOD packages at capture;
  serve captured bytes through the current inventory session's loopback service.
- Preserve drafts and editors while images load; discard stale responses and
  fall back when artwork is missing, rejected or cannot be decoded.
- Include a separate optional TPS artwork overlay for the v100.3 integration,
  preserving the supplied transparent TPS logo byte-for-byte.
- Keep the native scene, animation/background and existing setting-write path.
- Actual Cohtml icon/logo rendering and transparency await in-game validation.

## 1.2.4 — restore the complete preset row

- Expand the API guide with a level-selection table and complete Level 2/3
  examples; include their standalone source folders and optional SDKMODs.
- Treat all preset buttons, their shared label and container padding as one
  scroll item, including when the buttons wrap onto multiple lines.
- Returning from the last option to any remembered preset reveals the complete
  preset row and reaches the scroll start when the leading section fits.
- Reuse the same logical-row lookup for regular option controls and preserve
  focused-button visibility when an unusually tall preset row cannot fit.
- Check repeated bottom-to-top D-pad round trips for all three presets, wrapped
  and oversized rows, horizontal navigation and unchanged drafts/native models.

## 1.2.3 — complete D-pad scroll bounds

- Reveal the whole labeled option row when it fits in the viewport, including
  rows with separate Minus / Slider / Plus controls.
- Reach the actual scroll start/end at the first/last selectable item, including
  list padding, card margins and section spacing.
- Apply the same endpoint behavior to the language list and wrapped category
  tabs, using one shared scroll calculation.
- Preserve the full selected row when a long introduction or read-only tail
  would otherwise hide part of it at an endpoint. For oversized rows, keep the
  focused control visible; oversized cards retain a stable visible position.
- Check seven-card list bounds, complete option rows, presets, category tabs,
  tall content and retained scrollbar identity with both InputManager variants.

## 1.2.2 — Confirm without release prerequisites

- Leave the original InputManager action dispatcher unchanged and handle each
  native Confirm press independently, without waiting for a release event.
- Accept repeated click-only Confirm delivery without requiring mouse down/up,
  a direction change, a focus change or a matching logical action.
- Replace persistent route/held-input gates with a synchronous reentry guard
  and the native flag for deliberately simulated mouse clicks.
- Compare Press-only behavior against both original InputManager variants and
  cover repeated slider edits, language selection, mixed routes and exceptions.
- Retain 1.2.1's explicit font assignment and all fourteen translations.

## 1.2.1 — font assignment and repeated Confirm

- Apply concrete font stacks directly to menu text, controls and retained
  regions instead of relying on inherited font families in the native view.
- Keep each language name's regional font when switching the menu language.
- Rearm controller Confirm on each new press or primary mouse-button cycle,
  including repeated activation of the same control after a redraw.
- Continue suppressing held input and trailing synthetic clicks so a single
  gesture cannot toggle an option or enter an editor twice.
- Check font assignment throughout all 14 locales and repeated mixed Confirm
  routes, including reopening the language selector without moving focus.

## 1.2.0 — complete menu translations

- Translate all 88 ECHO menu strings into the 14 selectable text languages.
- Keep regional Spanish and Chinese translations in separate locale files.
- Validate complete dictionaries and unchanged format arguments at build time.
- Expand bundled fonts to cover every translated ECHO string and language name.
- Inherit the selected font stack throughout the menu, with regional script
  fallbacks and spacing for Asian text. Preserve mod-owned translation fallback.
- Exercise all 14 selections without changing staged SDK values.

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
