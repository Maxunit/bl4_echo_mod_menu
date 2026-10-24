"""Shared language identifiers for the UI and its persisted preferences."""
from .resources import read_json

LANGUAGES = read_json('bl4_echo_mod_menu', 'languages.json')
LANGUAGE_CODES = frozenset(row['code'] for row in LANGUAGES)
PREFERENCE_CODES = LANGUAGE_CODES | {'auto'}


def valid_preference(value):
    return type(value) is str and value in PREFERENCE_CODES
