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
