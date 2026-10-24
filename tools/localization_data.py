"""Load complete menu translations and validate their format arguments."""
from collections import Counter
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
ASIAN_LANGUAGES = {'ja','ko','zh-hans','zh-hant','th'}
UI_SYMBOLS = ' −+<>–…·/:%()0123456789'


def load_translations():
    languages = json.loads((ROOT/'src/bl4_echo_mod_menu/languages.json').read_text(encoding='utf-8'))
    expected = {row['code'] for row in languages}
    paths = {path.stem:path for path in (ROOT/'ui/locales').glob('*.json')}
    assert set(paths) == expected, 'Locale files must match the language registry'
    dictionaries = {code:json.loads(paths[code].read_text(encoding='utf-8')) for code in paths}
    english = dictionaries['en']
    for code, entries in dictionaries.items():
        assert entries.keys() == english.keys(), 'Missing or extra translation keys: '+code
        for key,text in entries.items():
            assert type(text) is str and text.strip(), (code,key,'empty translation')
            assert Counter(re.findall(r'\{[^{}]+\}',text)) == Counter(re.findall(r'\{[^{}]+\}',english[key])), (code,key,'format arguments differ')
    return {row['code']:dictionaries[row['code']] for row in languages}


def asian_character(codepoint):
    return (0x0e00 <= codepoint <= 0x0e7f or 0x1100 <= codepoint <= 0x11ff or
            0x2e80 <= codepoint <= 0xa4cf or 0xac00 <= codepoint <= 0xd7af or
            0xf900 <= codepoint <= 0xfaff or 0xff00 <= codepoint <= 0xffef)


def required_font_codepoints(code, dictionaries=None):
    dictionaries = dictionaries or load_translations()
    languages = json.loads((ROOT/'src/bl4_echo_mod_menu/languages.json').read_text(encoding='utf-8'))
    names = {row['code']:row['name'] for row in languages}
    if code == 'latin':
        text = ''.join(value for entries in dictionaries.values() for value in entries.values()) + ''.join(names.values()) + UI_SYMBOLS
        return {ord(char) for char in text if ord(char) >= 32 and not asian_character(ord(char))} | set(range(32,127))
    assert code in ASIAN_LANGUAGES
    text = ''.join(dictionaries[code].values()) + names[code]
    return {ord(char) for char in text if asian_character(ord(char))}
