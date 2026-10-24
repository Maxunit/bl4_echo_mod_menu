# ECHO Menu API v1

API version: `1`. First public package: ECHO Mod Menu `1.0.0`.
This is an ECHO extension, not a built-in PythonSDK API.

## Ownership and execution

A mod owns its setting definitions, current values, defaults, validation and
persistence. ECHO owns UI preferences and temporary drafts. ECHO never edits a
foreign mod's settings JSON directly.

Providers are discovered on already registered `mods_base.Mod` objects. ECHO
never imports arbitrary mod modules to discover integrations. All provider reads,
validation, ordering, writes, actions and saves execute on the menu's guarded
game thread. HTTP workers receive and validate plain JSON only.

Changes are staged. The existing Save/Apply flow submits the complete draft;
actual callbacks run on native inventory-navigation Deactivate. Switching to a
different native tab does not apply changes. Refreshing or changing the language
preserves the current draft according to the existing editor/session behavior.

## Level 1: no integration code

Register standard SDK options and actual keybind objects normally. ECHO reads
Boolean, Slider, Spinner/Dropdown, Button, Grouped/Nested and registered Keybind
objects. Hidden SDK entries remain hidden. Unsupported types are displayed as
read-only when representable. An optional declaration is never required.

Actual registered keybind objects are authoritative. A copied `KeybindOption`
does not override a registered binding's live key or its unbound `None` value.

## Level 2: optional presentation

Attach a plain dictionary after `build_mod` returns:

```python
mod.echo_menu_provider = {
    "api_version": 1,
    "id": "author.example",
    "revision": 1,
    "categories": [{"id": "camera", "name": {"en": "Camera", "de": "Kamera"}}],
    "options": [{
        "id": "distance", "option": distance_option, "category": "camera",
        "name": {"en": "Distance", "de": "Abstand"}, "unit": "cm",
    }],
}
```

The mod does not import ECHO and continues working when ECHO is absent.
`option` must reference one currently visible SDK option belonging to this mod.
ECHO retains the SDK's values, defaults, ranges, steps and change callbacks.
Metadata cannot make an unsupported or locked SDK option writable.

For keybind captions use `"keybind": actual_registered_binding` instead of
`option`. Bindings stay in the dedicated Keybinds category.

### Top-level fields

| Field | Meaning |
| --- | --- |
| `api_version` | Required integer `1`; unsupported versions fall back to SDK. |
| `id` | Required stable mod-owned namespace, e.g. `author.example`. |
| `revision` | Optional integer/string, default `1`; change for a new declaration. |
| `categories` | Ordered list of categories and optional presets. |
| `options` | Ordered metadata overrides referencing SDK options/keybinds. |
| `settings` | Ordered additional settings/actions with mod-owned callbacks. |
| `name`, `description` | Optional localized mod presentation. |
| `validate` | Optional zero-argument availability/identity validator. |
| `save` | Required for writable advanced settings/actions; saves custom state. |
| `order` | Optional pure function described below. |
| `unavailable_reason` | Optional localized explanation when `validate()` returns False. |

IDs start with an ASCII letter and contain letters, digits, `_`, `-` or `.`;
maximum 128 characters. Category IDs `general` and `keybinds` are reserved.
Setting IDs are unique inside one mod. Catalog transport IDs are opaque and
must never be stored or synthesized by a provider.

SDK options not mentioned in `options` keep their ordinary categories. An
integration can enrich part of a mod without hiding the remainder. Additional
settings must not shadow existing visible SDK entries.

### Presentation and language

Entries support `name`, `description`, `group`, `unit`, `true_text`, `false_text`,
`enabled_when`, `visible_when` and `choice_labels`. Text is a plain string or a
language map such as `{"en": "Distance", "de": "Abstand"}`. `default` can supply
an original/fallback caption. ECHO currently offers DE/EN language selection;
additional language maps can be supplied for future language support.
Resolution is selected language, English, explicit default/original SDK text.
HTML markup is stripped; provider text is rendered with `textContent`.

`choice_labels` maps actual stored choice strings to localized captions:
`{"Soft": {"en": "Soft", "de": "Weich"}}`. Stored values stay unchanged.
There is no execution of provider-supplied HTML, JavaScript or expressions.

A condition is `{"id": "other_setting", "equals": true}`. Its target must be
unique and present. `visible_when` hides the row, while `enabled_when` disables
editing. UI conditions use current drafts. Already accepted drafts survive a
later parent change; conditions are presentation rules, not a replacement for
authoritative validation in the mod. Validate writes independently.

### Presets

A category can declare:

```python
"presets": [{"id": "near", "name": {"en": "Near", "de": "Nah"},
             "values": {"distance": 40, "enabled": True, "mode": "Soft"}}]
```

Targets must belong to that category and have compatible values. Number,
Boolean and Choice settings may be mixed. Presets stage regular setting changes;
they do not bypass validation, readonly state or inventory-close application.

## Level 3: additional settings and actions

```python
"settings": [{
    "id": "custom_gain", "category": "camera", "kind": "number",
    "name": {"en": "Custom gain", "de": "Eigene Stärke"},
    "min": 0, "max": 100, "step": 1, "integer": True, "default": 25,
    "read": read_gain, "write": write_gain, "validate": validate_gain,
}],
"save": save_custom_settings,
```

| Kind | Required data/callbacks |
| --- | --- |
| `boolean` | `read()`; optional `write(value)` and Boolean default. |
| `number` | `read()`, finite min/max/positive step; optional integer/default/write. |
| `choice` | `read()`, nonempty unique string choices; optional default/write. |
| `readonly` | `read()` returning a primitive value; no write. |
| `action` | `run()`; no write/default. Runs once when its queued command applies. |

`editable: false` forces readonly state. `hidden: true` omits an advanced entry.
A hidden SDK option can be deliberately exposed by its own mod through an
advanced callback setting; ECHO never exposes it by a direct metadata override.
Advanced key rebinding is intentionally absent: use registered SDK keybinds.

Callbacks should raise an exception on failure, or return exactly `False`.
Any other return is accepted, including `None`. `read()` must be read-only and
return current primitive data. `validate(value)` is optional and must be
side-effect-free; min/max/integer/type validation happens before it. The mod
remains responsible for dependencies, quantization and runtime requirements.
`write(value)` must retain the requested value; ECHO reads it back. Provider
callbacks must preserve their own build/thread/owner/lifetime gates.

The top-level `validate()` is called at capture and again before advanced
operations. Returning `False` displays additional settings as readonly. Raising
while constructing the integration produces a normal SDK fallback. Ordinary
SDK options keep their SDK authorization independently of advanced availability.

`order(changes)` receives a new dictionary `{stable_setting_id: proposed_value}`
for that mod's integrated changes. Actions have value `None`. Return every
changed ID exactly once in the desired order. The callback is pure: do not
perform writes or mutate the declaration. Unknown/duplicate/missing IDs refuse
the entire batch before any setting callback is invoked.

## Applying and saving

ECHO preflights the full batch before writes, then rechecks each target just
before invoking it. Public SDK values use normal assignment, so the SDK's own
callbacks run once. Advanced values use the mod's write callback. ECHO calls the
provider's `save()` for dirty integrated state and then `mod.save_settings()`.
`save()` is for custom stores; it need not duplicate standard SDK persistence.
A mod's existing feature setters may already save internally; ECHO does not
monkeypatch or suppress that behavior.

Before disabling an integrated mod with pending changes, those changes are
applied and persisted while its write authorization still exists. Generic SDK
mods retain the existing disable/configure order. Enabling occurs after
configuration. A currently disabled advanced provider may require enabling and
reopening the inventory before its controls become available.

There is no atomic rollback promise. A setter can mutate state before failing.
ECHO stops further commands, attempts to save actual changed state, and reports
completed commands and custom/SDK persistence separately. Removed/reloaded mod
registrations are never saved through stale objects. Provider actions should
be designed to tolerate these documented partial-failure semantics.

## Registration, reload and compatibility

Assign `mod.echo_menu_provider` after registration. To unregister, delete that
attribute. There are no manager subscriptions to remove. Declarations and
callback objects must remain stable during an open inventory session. Do not
rebuild the dictionary every frame or mutate it from a worker. Changes/reloads
are recognized on the next safe catalog capture. Old drafts are refused if the
mod, version, provider dictionary, revision, callbacks, SDK options, bounds or
current baseline changed. Closing/reopening creates a fresh capture.

A malformed provider falls back only for its mod. Other mods remain usable.
Limits include 128 mods, 256 combined settings per mod, 64 custom categories,
32 presets per category and bounded strings/nesting. Invalid metadata is
reported under `catalog.mods[].integration`; the UI shows a localized fallback
notice. Unknown fields are rejected in v1; a future breaking schema needs a new
API version. Do not use ECHO package versions or mod filenames as authorization.

The complete runnable example is under `examples/echo_menu_example`.
An optional ready-to-install SDKMOD is included under `examples/` in the install package.
