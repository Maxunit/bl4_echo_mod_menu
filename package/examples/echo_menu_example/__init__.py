"""Harmless API v1 example: settings only, no native calls or gameplay hooks.

Delete only the final provider assignment to see the automatic SDK fallback.
The mod remains usable through ordinary SDK options without ECHO installed.
"""
import json
from pathlib import Path
from mods_base import BoolOption, SliderOption, SpinnerOption, Game, SETTINGS_DIR, build_mod, keybind

EXTRA_FILE = Path(SETTINGS_DIR) / 'ECHO_Menu_Example.extra.json'
try:
    _stored = json.loads(EXTRA_FILE.read_text(encoding='utf-8'))
    _counter = _stored.get('counter', 0)
    if type(_counter) is not int or not 0 <= _counter <= 99:
        _counter = 0
except (OSError, ValueError, TypeError, AttributeError):
    _counter = 0

enabled_extra = BoolOption('show_extra', True, display_name='Show additional settings')
strength = SliderOption('strength', 25, 0, 100, step=5, is_integer=True, display_name='Strength')
mode = SpinnerOption('mode', 'Normal', ['Normal', 'Soft'], display_name='Mode')


@keybind('echo_example_action', None, display_name='Example key')
def example_key():
    """Intentionally no gameplay behavior: demonstrates a registered binding."""


mod = build_mod(name='ECHO API Example', author='ECHO Mod Menu contributors', version='1.0.0',
                supported_games=Game.BL4, options=[enabled_extra, strength, mode],
                keybinds=[example_key], description='Optional settings-only ECHO Menu API v1 example.')


def read_counter():
    return _counter


def validate_counter(value):
    return type(value) is int and 0 <= value <= 99


def write_counter(value):
    global _counter
    if not validate_counter(value):
        raise ValueError('Counter must be an integer between 0 and 99')
    _counter = value


def reset_counter():
    write_counter(0)


def save_extra():
    EXTRA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = EXTRA_FILE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'counter': _counter}) + '\n', encoding='utf-8')
    temporary.replace(EXTRA_FILE)


mod.echo_menu_provider = {
    'api_version': 1, 'id': 'echo.example', 'revision': 1,
    'categories': [{'id': 'settings', 'name': {'en': 'SETTINGS', 'de': 'EINSTELLUNGEN'},
        'presets': [{'id': 'gentle', 'name': {'en': 'GENTLE', 'de': 'SANFT'},
                     'values': {'strength': 10, 'mode': 'Soft', 'show_extra': True}}]}],
    'options': [
        {'id': 'show_extra', 'option': enabled_extra, 'category': 'settings',
         'name': {'en': 'Show additional settings', 'de': 'Zusätzliche Einstellungen anzeigen'}},
        {'id': 'strength', 'option': strength, 'category': 'settings', 'unit': '%',
         'name': {'en': 'Strength', 'de': 'Stärke'}},
        {'id': 'mode', 'option': mode, 'category': 'settings',
         'name': {'en': 'Mode', 'de': 'Modus'},
         'choice_labels': {'Normal': {'en': 'Normal', 'de': 'Normal'},
                           'Soft': {'en': 'Soft', 'de': 'Weich'}}},
        {'id': 'example_key', 'keybind': example_key,
         'name': {'en': 'Example key', 'de': 'Beispieltaste'}},
    ],
    'settings': [
        {'id': 'counter', 'kind': 'number', 'category': 'settings',
         'name': {'en': 'Example counter', 'de': 'Beispielzähler'},
         'description': {'en': 'Owned and saved by this mod, outside standard SDK options.',
                         'de': 'Wird von dieser Mod außerhalb der normalen SDK-Optionen gespeichert.'},
         'min': 0, 'max': 99, 'step': 1, 'integer': True, 'default': 0,
         'visible_when': {'id': 'show_extra', 'equals': True},
         'read': read_counter, 'write': write_counter, 'validate': validate_counter},
        {'id': 'reset_counter', 'kind': 'action', 'category': 'settings',
         'name': {'en': 'Reset example counter', 'de': 'Beispielzähler zurücksetzen'},
         'visible_when': {'id': 'show_extra', 'equals': True}, 'run': reset_counter},
    ],
    'save': save_extra,
}
