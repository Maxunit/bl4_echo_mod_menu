"""Bounded API v1 data validation shared with the plain-data transaction layer.

Labels accept a string or a language map. Callables and SDK option objects stay
inside ProviderSession; only normalized primitive data reaches the UI worker.
"""
from __future__ import annotations
import math
import re

MAX_ITEMS = 256
KINDS = {'boolean', 'number', 'choice', 'readonly', 'action'}


class InvalidProvider(ValueError):
    pass


def identifier(value):
    if type(value) is not str or re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,127}', value) is None:
        raise InvalidProvider('Expected a stable ASCII identifier')
    return value


def sequence(value, label, limit=MAX_ITEMS):
    if type(value) not in (list, tuple) or len(value) > limit:
        raise InvalidProvider(label + ' must be a bounded list')
    return value


def scalar(value):
    return (value is None or type(value) in (bool, int, str)
            or type(value) is float and math.isfinite(value)) and not (
                type(value) is str and len(value) > 4000)


def same(a, b):
    return (type(a) is type(b) and a == b or
            type(a) in (int, float) and type(b) in (int, float) and a == b)


def localized(target, field, source, fallback='', limit=1500):
    """Keep the SDK/original caption as the final fallback, never HTML markup."""
    from html import unescape
    def clean(value):
        if type(value) is not str or len(value) > limit:
            raise InvalidProvider('Invalid localized ' + field)
        return unescape(re.sub(r'<[^>]*>', '', value)).strip()
    if type(source) is str:
        target[field] = clean(source)
        return
    if type(source) is not dict or not source or len(source) > 32:
        raise InvalidProvider('Expected text or language map for ' + field)
    translations = {}
    for language, value in source.items():
        if type(language) is not str or re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}', language) is None:
            raise InvalidProvider('Invalid language code')
        translations[language.lower().replace('_', '-')] = clean(value)
    target[field] = translations.get('default', fallback or translations.get('en', next(iter(translations.values()))))
    target[field + '_i18n'] = translations


def presentation(target, source):
    for field, limit in [('name', 200), ('description', 1500), ('group', 200), ('unit', 32),
                         ('true_text', 200), ('false_text', 200)]:
        if field in source:
            localized(target, field, source[field], target.get(field, ''), limit)
    for field in ('enabled_when', 'visible_when'):
        if field in source:
            value = source[field]
            if type(value) is not dict or set(value) != {'id', 'equals'} or not scalar(value['equals']):
                raise InvalidProvider('Invalid ' + field)
            target[field] = {'id': identifier(value['id']), 'equals': value['equals']}
    if 'choice_labels' in source:
        labels = source['choice_labels']
        if (target.get('kind') != 'choice' or type(labels) is not dict or
                set(labels) - set(target['choices'])):
            raise InvalidProvider('Invalid choice labels')
        target['choice_labels'] = {}
        for key, label in labels.items():
            item = {}
            localized(item, 'name', label, key, 200)
            target['choice_labels'][key] = item


def validate_value(spec, value):
    kind = spec['kind']
    if kind == 'boolean':
        return type(value) is bool
    if kind == 'number':
        return (type(value) in (int, float) and (type(value) is int or math.isfinite(value))
                and spec['min'] <= value <= spec['max']
                and (not spec['integer'] or int(value) == value))
    if kind == 'choice':
        return type(value) is str and value in spec['choices']
    if kind == 'keybind':
        from ..menu.keybinds import valid_key
        return valid_key(value)
    return kind == 'readonly' and scalar(value)


def value_shape(source):
    kind = source.get('kind')
    if kind not in KINDS:
        raise InvalidProvider('Unsupported advanced setting kind')
    result = {'kind': kind, 'integer': False}
    if kind == 'number':
        bounds = [source.get(key) for key in ('min', 'max', 'step')]
        if (any(type(x) not in (int, float) or not math.isfinite(x) for x in bounds)
                or bounds[0] > bounds[1] or bounds[2] <= 0 or type(source.get('integer', False)) is not bool):
            raise InvalidProvider('Invalid numeric bounds')
        result.update(min=bounds[0], max=bounds[1], step=bounds[2], integer=source.get('integer', False))
    if kind == 'choice':
        choices = sequence(source.get('choices'), 'choices', 128)
        if not choices or any(type(c) is not str or len(c) > 1000 for c in choices) or len(set(choices)) != len(choices):
            raise InvalidProvider('Invalid choices')
        result['choices'] = list(choices)
    if 'default' in source:
        if kind == 'action' or not validate_value(result, source['default']):
            raise InvalidProvider('Invalid advanced default')
        result.update(default=source['default'], has_default=True)
    else:
        result.update(default=None, has_default=False)
    return result


def condition_allows(condition, baseline, planned):
    if not condition:
        return True
    key, expected = condition['id'], condition['equals']
    # An existing draft remains savable when its parent is subsequently turned
    # off. A parent enabled in this batch also permits its dependent setting.
    return ((key in baseline and same(baseline[key], expected)) or
            (key in planned and same(planned[key], expected)))


def state_token(value, budget=None, depth=0):
    """Detect declaration/callback replacement; ignore mutable SDK object data."""
    if budget is None:
        budget = [10000]
    budget[0] -= 1
    if depth > 24 or budget[0] < 0:
        raise InvalidProvider('Provider declaration exceeds limits or contains a cycle')
    if type(value) is dict:
        if any(type(key) is not str for key in value):
            raise InvalidProvider('Provider keys must be strings')
        return ('dict', tuple((key, state_token(item, budget, depth + 1)) for key, item in sorted(value.items())))
    if type(value) in (list, tuple):
        return ('list', tuple(state_token(item, budget, depth + 1) for item in value))
    if scalar(value):
        return (type(value).__name__, value)
    return ('object', id(value))
