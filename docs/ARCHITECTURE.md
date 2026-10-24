# Architecture

## Runtime package

- `lifecycle.py`: one-shot inventory bootstrap and coordinated shutdown.
- `menu/controller.py`: game-thread catalog capture and inventory-close apply.
- `menu/catalog.py`: SDK/provider ownership, preflight, setters and persistence.
- `menu/transactions.py`: bounded plain-JSON draft/session mailbox.
- `menu/server.py`: loopback transport and independent UI preferences.
- `integration/`: provider API schema, localization and mod-owned callbacks.
- `scene/`: reviewed native request allocation, submission, cancellation and release.
- `native_installation.py`: required external tag declarations before native work.

The HTTP worker handles JSON only. SDK objects/callbacks are retained on the game
thread. Apply rechecks mod/provider identity, baseline, bounds and authorization.
Partial writes and SDK/custom-store save errors are reported separately.

The scene bridge checks its exact executable profile and reflected lifecycle
signatures. It holds copied ownership tokens, not persistent UObject wrappers or
Python callbacks in the native queue. Shutdown retains failed cleanup state for
retry. There are no timers, Tick hooks, gameplay loops or gamepad polling.

## Frontend and native host

`native/widget_manager.base.js` and `navigationbar.base.js` are preserved native
inputs. Build appends focused extensions from `ui/`:

- `transport.js`: protocol marker, bounded local diagnostics, render descriptions.
- `editor.js`: catalog, drafts, fields, capture, persistent scroll panes and layout.
- `controller.js`: semantic focus graph, editing, native action/click routes and
  contextual CohEscape ownership.
- `bootstrap.js`: own-instance attach/lifecycle hooks and material transition.
- `navigation.js`: caption for the existing Mods entry only.

Global inventory/console observers and historical export queues are absent.
The editor hides only its own native placeholder list/title and never replaces
native inventory data. It attaches after the original WidgetManager method.
Input registration is reconciled through original MenuBase behavior at activation
so an unchanged native entries revision cannot strand a reopened menu.

Confirm follows the original InputManager's per-PRESSED dispatch without
replacing `OnInputAction`. There is no ECHO latch waiting for RELEASED, a mouse
up event, a direction change or a particular preceding route. The bridge also
accepts independent click-only delivery. It rejects known native simulated
mouse events and synchronous selection reentry; the reentry guard is cleared
in `finally`, including when the selected callback throws. Separate native
presses remain separate inputs, as they are in the original dispatcher.

## Stable compiled identities

The two native NCS resources retain private binding names such as
`def_bl4_empty_page_v40`, `UI.Tag.BL4_MODS_EMPTY_V39` and
`UI.State.MENU_BL4_MODS_EMPTY_V39`. They are opaque compiled state/widget keys,
not public APIs or development entry points. Rename only after rebuilding and
reviewing every native reference. The INI, Python scene and JavaScript host use
the same contract. Public package, API, logs and UI names are independent.

## State and transport

The SDK settings directory owns mod values. ECHO keeps only language preferences
and temporary/queued drafts. Diagnostic files are opt-in (or produced on errors).
The local transport binds to `127.0.0.1`; its fixed protocol marker is not a secret
or an authorization replacement. Mod setters retain their own authority checks.
