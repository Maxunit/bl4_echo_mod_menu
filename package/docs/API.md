# ECHO Menu API v1

Provider API version: **1**, verified against ECHO Mod Menu **1.3.3**.
This is an optional ECHO extension on a registered PythonSDK mod. Your mod imports
`mods_base`, never ECHO. ECHO's package version and your mod's version are
independent of the provider API version.

## Choose an integration level

| Your mod needs | Level | What you add | Who saves the values? |
| --- | --- | --- | --- |
| Ordinary SDK options and registered keybinds | **1: automatic** | Nothing beyond normal SDK registration | The SDK, through your mod |
| Categories, presets, units, conditions or translated labels/descriptions | **2: presentation** | A dictionary referencing your real SDK objects | The SDK, through your mod |
| Values outside SDK options, or mod-owned actions | **3: callbacks** | Read/write/validation callbacks and a custom save callback | Your callbacks save custom data; the SDK still saves SDK data |

The levels can be combined in one provider. Use Level 2 for an existing slider;
use Level 3 for a value owned by a separate settings system. Level 3 does not
require replacing ordinary SDK options.

Start with the complete [Level 2 example](#level-2-complete-sdk-presentation-example)
or [Level 3 example](#level-3-complete-mod-owned-settings-example). Both code blocks
are entire `__init__.py` files with all imports, values and callbacks defined.
Their source files and optional SDKMODs are included under `examples/`.

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

## Level 2: complete SDK presentation example

Source: [echo_menu_level2/__init__.py](../examples/echo_menu_level2/__init__.py).
To try the supplied build, copy `examples/echo_menu_level2.sdkmod` into
`sdk_mods` and restart the game. Enable the example if it is disabled.
Alternatively, save the complete code below as
`sdk_mods/echo_menu_level2/__init__.py`. Choose one installation form.

This example stores two ordinary SDK options. Its distance is a sample value
with no camera or gameplay effect. The optional provider adds a category,
three presets, a unit, an editing condition and English/German names **and**
descriptions. Removing the provider assignment leaves the SDK options usable.

```python
"""Complete Level 2 example: SDK-owned values with optional ECHO metadata.

This settings-only example has no gameplay hooks and does not import ECHO.
"""

from mods_base import BoolOption, Game, SliderOption, build_mod


camera_enabled = BoolOption(
    "camera_enabled",
    True,
    display_name="Enable camera settings",
    description="Allow the distance setting to be edited.",
)
distance_option = SliderOption(
    "distance",
    150,
    60,
    300,
    step=10,
    is_integer=True,
    display_name="Camera distance",
    description="Example distance in centimetres; no game camera is changed.",
)

mod = build_mod(
    name="ECHO Level 2 Example",
    author="ECHO Mod Menu contributors",
    version="1.0.0",
    supported_games=Game.BL4,
    description="SDK settings with optional ECHO presentation metadata.",
    options=[camera_enabled, distance_option],
)

# Attach one stable declaration after SDK registration. These references are
# the actual registered option objects, not copies or identifier strings.
mod.echo_menu_provider = {
    "api_version": 1,
    "id": "example.echo.level2",
    "revision": 1,
    "categories": [
        {
            "id": "camera",
            "name": {"en": "Camera", "de": "Kamera"},
            "presets": [
                {
                    "id": "standard",
                    "name": {"en": "Standard", "de": "Standard"},
                    "values": {"camera_enabled": True, "distance": 150},
                },
                {
                    "id": "near",
                    "name": {"en": "Near", "de": "Nah"},
                    "values": {"camera_enabled": True, "distance": 100},
                },
                {
                    "id": "wide",
                    "name": {"en": "Wide", "de": "Weit"},
                    "values": {"camera_enabled": True, "distance": 250},
                },
            ],
        },
    ],
    "options": [
        {
            "id": "camera_enabled",
            "option": camera_enabled,
            "category": "camera",
            "name": {"en": "Enable camera settings", "de": "Kameraoptionen aktivieren"},
            "description": {
                "en": "Allow the distance setting to be edited.",
                "de": "Erlaubt das Bearbeiten der Abstandseinstellung.",
            },
            "true_text": {"en": "On", "de": "An"},
            "false_text": {"en": "Off", "de": "Aus"},
        },
        {
            "id": "distance",
            "option": distance_option,
            "category": "camera",
            "unit": "cm",
            "name": {"en": "Camera distance", "de": "Kameraabstand"},
            "description": {
                "en": "Example distance only; this mod does not move the camera.",
                "de": "Nur ein Beispielwert; diese Mod bewegt die Kamera nicht.",
            },
            "enabled_when": {"id": "camera_enabled", "equals": True},
        },
    ],
}
```

### What this example demonstrates

- `build_mod` registers the options before the provider is attached.
- `option` refers to the exact registered option object. ECHO keeps its live
  value, default, range, step, editability and SDK change callbacks.
- The stable provider IDs `camera_enabled` and `distance` are used by presets
  and conditions. They are not ECHO's opaque catalog transport IDs.
- Selecting a preset stages values. Save & Apply queues them; closing the
  inventory assigns them to the SDK options and calls `mod.save_settings()`.
- No provider `save` callback is needed because this mod has no custom store.
  SDK loading and saving continue to work without ECHO installed.
- Translate each field separately: a translated `name` does not translate its
  `description`. Game code continues to read `distance_option.value` in every
  menu language.

For a keybind caption, use `"keybind": actual_registered_binding` instead of
`option`. Bindings stay in the dedicated Keybinds category. The combined
[example](../examples/echo_menu_example/__init__.py) includes a registered keybind.

## Provider declaration reference

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
an original/fallback caption. ECHO offers Auto plus 14 explicit language selections.
Canonical map keys are `en`, `fr`, `it`, `de`, `es-es`, `ja`, `ko`, `pt-br`, `ru`,
`zh-hans`, `th`, `zh-hant`, `pl` and `es-419`. Codes are case-insensitive and
underscores are normalized to hyphens when the provider is read.
Resolution is selected language, equivalent locale aliases, base language,
English and explicit default/original SDK text. ECHO's own menu text is translated
into all 14 supported languages. Provider translations remain the author's own
data and do not change stored values, setting identifiers or native game language.
HTML markup is stripped; provider text is rendered with `textContent`.

Bundled font subsets cover ECHO's shipped text and language names. Provider
strings that introduce additional Asian characters may need extended font
coverage; supplying a language map does not automatically add glyphs or register
fonts. The source build checks ECHO's own glyph coverage against its locale files.

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

## Level 3: complete mod-owned settings example

Source: [echo_menu_level3/__init__.py](../examples/echo_menu_level3/__init__.py).
Copy `examples/echo_menu_level3.sdkmod` into `sdk_mods` and restart, or save the
complete code below as `sdk_mods/echo_menu_level3/__init__.py`. Enable the example
if it is disabled. Choose one installation form.

This example loads an integer from its own JSON file, exposes that live value
through ECHO, validates changes in the setter, and saves through a separate
callback. Its Reset action is queued like other changes. There are no game
hooks or native memory accesses, and no dependency on ECHO imports.

```python
"""Complete Level 3 example: mod-owned JSON, validation and a queued action.

This settings-only example has no gameplay hooks and does not import ECHO.
"""

import json
from pathlib import Path

from mods_base import Game, SETTINGS_DIR, build_mod


DEFAULT_GAIN = 25
EXTRA_FILE = Path(SETTINGS_DIR) / "echo_menu_level3.extra.json"


def validate_gain(value: object) -> bool:
    """Reject booleans, fractions and values outside the declared range."""
    return type(value) is int and 0 <= value <= 100


def load_gain() -> int:
    """Use the default if the optional custom store is absent or malformed."""
    try:
        stored = json.loads(EXTRA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return DEFAULT_GAIN
    if not isinstance(stored, dict):
        return DEFAULT_GAIN
    value = stored.get("gain", DEFAULT_GAIN)
    return value if validate_gain(value) else DEFAULT_GAIN


_gain: int = load_gain()


def read_gain() -> int:
    """Read live mod-owned state without changing or saving it."""
    return _gain


def write_gain(value: int) -> None:
    """Validate independently of ECHO, then retain the requested value."""
    global _gain
    if not validate_gain(value):
        raise ValueError("Gain must be an integer between 0 and 100")
    _gain = value


def reset_gain() -> None:
    """The action runs when the queued change is applied, not when clicked."""
    write_gain(DEFAULT_GAIN)


def save_custom_settings() -> None:
    """Persist custom state; let write errors reach ECHO's result reporting."""
    EXTRA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = EXTRA_FILE.with_name(EXTRA_FILE.name + ".tmp")
    temporary.write_text(json.dumps({"gain": _gain}) + "\n", encoding="utf-8")
    temporary.replace(EXTRA_FILE)


def order_changes(changes: dict[str, object]) -> list[str]:
    """If both are queued, apply the requested gain before the reset action."""
    ordered = [setting_id for setting_id in changes if setting_id != "reset_gain"]
    if "reset_gain" in changes:
        ordered.append("reset_gain")
    return ordered


mod = build_mod(
    name="ECHO Level 3 Example",
    author="ECHO Mod Menu contributors",
    version="1.0.0",
    supported_games=Game.BL4,
    description="A mod-owned value and action with an independent JSON store.",
    options=[],
)

mod.echo_menu_provider = {
    "api_version": 1,
    "id": "example.echo.level3",
    "revision": 1,
    "categories": [
        {
            "id": "custom",
            "name": {"en": "Custom settings", "de": "Eigene Einstellungen"},
        },
    ],
    "settings": [
        {
            "id": "custom_gain",
            "category": "custom",
            "kind": "number",
            "name": {"en": "Custom gain", "de": "Eigene Stärke"},
            "description": {
                "en": "Saved in this example's own JSON file; no gameplay effect.",
                "de": "Wird in einer eigenen JSON-Datei gespeichert; ohne Spieleffekt.",
            },
            "min": 0,
            "max": 100,
            "step": 1,
            "integer": True,
            "default": DEFAULT_GAIN,
            "read": read_gain,
            "validate": validate_gain,
            "write": write_gain,
        },
        {
            "id": "reset_gain",
            "category": "custom",
            "kind": "action",
            "name": {"en": "Reset custom gain", "de": "Eigene Stärke zurücksetzen"},
            "description": {
                "en": "Queue a reset to 25. It runs when the inventory closes.",
                "de": "Merkt das Zurücksetzen auf 25 beim Schließen des Inventars vor.",
            },
            "run": reset_gain,
        },
    ],
    "save": save_custom_settings,
    "order": order_changes,
}
```

### What this example demonstrates

| Step | Owner and behavior |
| --- | --- |
| Mod import | `load_gain()` reads the custom JSON store; absent or malformed data uses 25. |
| Catalog capture and revalidation | `read_gain()` returns current state without writing files. |
| Editing or selecting Run | ECHO changes a draft only; the mod's value and file are unchanged. |
| Save & Apply | ECHO queues the complete draft. Callbacks still have not applied it. |
| Closing the inventory | ECHO validates, calls `write_gain()` and/or `reset_gain()`, then calls `save_custom_settings()` and `mod.save_settings()`. |
| Restarting the game | The mod loads its custom JSON file again; ECHO does not load it for the mod. |

The custom file is `echo_menu_level3.extra.json` under the SDK's `SETTINGS_DIR`,
not inside the mod folder or SDKMOD. The SDK owns its separate standard settings
file. The custom saver does not need to write SDK options or call the SDK saver.

To try the action, choose Run beside Reset custom gain, then Save & Apply and
close the inventory. An action can modify live state without its resulting
value being previewed in the draft. If a gain change and Reset are both queued,
`order_changes()` places Reset last, so the final stored gain is 25. It returns
all supplied stable IDs exactly once and performs no writes itself.

Without ECHO, this example still loads and owns `_gain`; it does not provide a
separate SDK editor for that advanced setting. In a real mod, reuse your existing
feature getters, validated setters and persistence functions. Preserve their
build, game-thread, world/actor and lifetime checks where those apply.

### Advanced setting reference

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

## Troubleshooting an integration

| Symptom | Check |
| --- | --- |
| Only ordinary SDK presentation appears | Attach the dictionary to the exact registered `mod` object after `build_mod`. In diagnostics, `automatic` means no provider was attached; `fallback` means its declaration was rejected. |
| Provider falls back | Check `api_version`, unique stable IDs, allowed fields and real SDK object references. Writable advanced entries and actions require top-level `save`. |
| A name is translated but its description is English | Supply both `name` and `description` language maps. Each field has its own fallback. |
| A new translated character appears as a box | Check font coverage as described above; provider text does not expand the bundled subsets. |
| A value changes in the UI but the mod still reads its old value | Save & Apply queues the draft; close the inventory to apply it. Switching native tabs is insufficient. |
| An advanced value is not restored after restart | Load the mod's custom store during its own initialization. ECHO calls the saver but does not implement the mod's loader. |
| A queued action appears to do nothing immediately | Run stages the action; it executes after Save & Apply and inventory close. |
| Old changes are refused after reloading the mod | Close and reopen the inventory, then make a fresh draft against the new provider instance. |

## Included examples

| Package | Focus |
| --- | --- |
| `echo_menu_level2` | Complete SDK-owned options, categories, presets, conditions and translations. |
| `echo_menu_level3` | Complete mod-owned loading, validation, writes, saving, action and ordering. |
| `echo_menu_example` | Combined integration with SDK options, a real registered keybind and separate custom persistence. |

Each folder contains its full `__init__.py`. The install package includes those
sources beside optional SDKMODs under `examples/`; the developer archive also
contains the sources. Copy an example's SDKMOD into `sdk_mods` only if you want
to run it. Replace sample IDs, names, defaults and file names when adapting it
for a real mod; keep identifiers stable after publishing.
