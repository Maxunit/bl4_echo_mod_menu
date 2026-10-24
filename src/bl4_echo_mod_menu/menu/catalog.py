"""SDK option schema and game-thread bindings. Never passed to the HTTP worker."""
from __future__ import annotations
import hashlib
import html
import math
import re
from datetime import datetime, timezone
from threading import get_ident
from ..integration.provider import enrich, BoundSetting
from ..integration.contract import validate_value
from .keybinds import LiveKeybind, valid_key

MAX_MODS, MAX_OPTIONS, MAX_DEPTH = 128, 256, 8


def text(value, limit=1000):
    raw = re.sub(r'<(?:br\s*/?|/?(?:p|div|li|ul|ol))\b[^>]*>', '\n', str(value or ''), flags=re.I)
    return html.unescape(re.sub(r'<[^>]*>', '', raw)).strip()[:limit]


def plain(value):
    if value is None or type(value) in (str, bool, int):
        return value if not isinstance(value, str) else value[:4000]
    if type(value) is float and math.isfinite(value):
        return value
    return None


def equal(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    return a == b


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def kind_of(option):
    names = {cls.__name__ for cls in type(option).__mro__}
    for name, kind in [('HiddenOption', 'hidden'), ('GroupedOption', 'group'),
                       ('NestedOption', 'group'), ('BoolOption', 'boolean'),
                       ('SliderOption', 'number'), ('SpinnerOption', 'choice'),
                       ('DropdownOption', 'choice'), ('ButtonOption', 'action'),
                       ('KeybindOption', 'keybind')]:
        if name in names:
            return kind
    return 'readonly'


class Registry:
    def __init__(self, base):
        self.base = base
        self.mods, self.options = {}, {}
        self.providers = {}
        self.thread = get_ident()
        self.snapshot = None

    def same_thread(self):
        if get_ident() != self.thread:
            raise RuntimeError('Catalog/provider access outside the capture game thread')

    def capture(self):
        self.same_thread()
        rows, errors, mods, options, profiles = [], [], {}, {}, {}
        getter = getattr(self.base, 'get_ordered_mod_list', None)
        if not callable(getter):
            raise RuntimeError('mods_base.get_ordered_mod_list is unavailable')
        for index, mod in enumerate(getter()):
            if index >= MAX_MODS:
                errors.append('Mod list truncated at 128 entries')
                break
            try:
                name = text(getattr(mod, 'name', type(mod).__name__), 160)
                identity = type(mod).__module__ + ':' + type(mod).__qualname__ + ':' + name
                mid = digest(identity) + ':' + str(index)
                enabled = getattr(mod, 'is_enabled', None)
                locked = bool(getattr(mod, 'enabling_locked', True))
                row = {'id': mid, 'name': name, 'author': text(getattr(mod, 'author', ''), 200),
                       'version': text(getattr(mod, 'version', ''), 100),
                       'description': text(getattr(mod, 'description', ''), 4000),
                       'enabled': enabled if type(enabled) is bool else None,
                       'status': text(mod.get_status(), 200) if callable(getattr(mod, 'get_status', None)) else '',
                       'type': text(getattr(mod, 'mod_type', ''), 100),
                       'can_toggle': not locked and type(enabled) is bool and
                           callable(getattr(mod, 'enable', None)) and callable(getattr(mod, 'disable', None)),
                       'persistent': getattr(mod, 'settings_file', None) is not None,
                       'options': [], 'categories': []}
                mods[mid] = (mod, row)
                source = mod.iter_display_options() if callable(getattr(mod, 'iter_display_options', None)) else getattr(mod, 'options', ()) or ()
                visited, keybinds, count = set(), set(), [0]
                live_bindings = list(getattr(mod, 'keybinds', ()) or ())
                live_identifiers = {getattr(b, 'identifier', None) for b in live_bindings}

                def visit(items, path=(), category=None, group='', depth=0):
                    if depth > MAX_DEPTH:
                        errors.append('Option nesting truncated: ' + name)
                        return
                    for ordinal, option in enumerate(items):
                        if ordinal >= MAX_OPTIONS or count[0] >= MAX_OPTIONS:
                            errors.append('Option count truncated: ' + name)
                            break
                        if id(option) in visited:
                            continue
                        visited.add(id(option))
                        if getattr(option, 'is_hidden', False):
                            continue
                        kind = kind_of(option)
                        if kind == 'hidden':
                            continue
                        ident = str(getattr(option, 'identifier', ''))[:256] or str(ordinal)
                        part = ident + '#' + str(ordinal)
                        route = path + (part,)
                        label = text(getattr(option, 'display_name', ident), 200)
                        if kind == 'group':
                            cid = category
                            if cid is None:
                                cid = digest('/'.join(route))
                                row['categories'].append({'id': cid, 'name': label})
                            visit(getattr(option, 'children', ()) or (), route, cid,
                                  label if category is not None else '', depth + 1)
                            continue
                        entry_category = 'keybinds' if kind == 'keybind' else category or 'general'
                        value = plain(getattr(option, 'value', None))
                        if kind == 'keybind':
                            # SDK KeybindOption.from_keybind is a one-way copy.
                            # Never retain its stale value when a live binding exists,
                            # including hidden/non-rebindable registered bindings.
                            if getattr(option, 'identifier', None) in live_identifiers or ident in keybinds:
                                continue
                            keybinds.add(ident)
                            if not any(c['id'] == 'keybinds' for c in row['categories']):
                                row['categories'].append({'id': 'keybinds', 'name': 'Keybinds', 'label_key': 'keybinds'})
                        elif category is None:
                            if not any(c['id'] == entry_category for c in row['categories']):
                                row['categories'].append({'id': entry_category, 'name': '', 'label_key': 'general'})
                        oid = digest(mid + '/' + '/'.join(route))
                        entry = {'id': oid, 'identifier': ident, 'name': label, 'category': entry_category,
                                 'group': group, 'type': type(option).__name__, 'kind': kind,
                                 'value': value, 'default': plain(getattr(option, 'default_value', None)),
                                 'has_default': hasattr(option, 'default_value'),
                                 'description': text(getattr(option, 'description', ''), 1500),
                                 'editable': kind in ('boolean', 'number', 'choice'),
                                 'unit': text(getattr(option, 'unit', ''), 32),
                                 'can_run': kind == 'action' and callable(getattr(option, 'on_press', None))}
                        if kind == 'boolean':
                            entry['true_text'] = text(getattr(option, 'true_text', ''), 200)
                            entry['false_text'] = text(getattr(option, 'false_text', ''), 200)
                        if kind == 'number':
                            bounds = [getattr(option, field, None) for field in ('min_value', 'max_value', 'step')]
                            if all(type(v) in (int, float) and math.isfinite(v) for v in bounds) and bounds[0] <= bounds[1] and bounds[2] > 0:
                                entry.update(min=bounds[0], max=bounds[1], step=bounds[2], integer=bool(getattr(option, 'is_integer', False)))
                            else:
                                entry['editable'] = False
                        if kind == 'choice':
                            choices = list(getattr(option, 'choices', ()) or ())
                            if len(choices) > 128 or not all(type(v) is str and len(v) <= 1000 for v in choices):
                                choices, entry['editable'] = [], False
                            entry['choices'] = choices
                            if not choices:
                                entry['editable'] = False
                        if kind == 'boolean' and type(value) is not bool or kind == 'number' and type(value) not in (int, float):
                            entry['editable'] = False
                        row['options'].append(entry)
                        options[(mid, oid)] = (option, entry)
                        count[0] += 1
                visit(source)
                seen_bindings = set()
                for binding in live_bindings:
                    if count[0] >= MAX_OPTIONS:
                        errors.append('Keybind count truncated: ' + name)
                        break
                    ident = getattr(binding, 'identifier', None)
                    if type(ident) is not str or not ident or ident in seen_bindings:
                        continue
                    seen_bindings.add(ident)
                    if getattr(binding, 'is_hidden', False):
                        continue
                    bound = LiveKeybind(mod, binding)
                    editable = True
                    try:
                        bound.validate()
                    except RuntimeError:
                        editable = False
                    oid = digest(mid + '/registered-keybind/' + ident)
                    default = getattr(binding, 'default_key', None)
                    entry = dict(id=oid, identifier=ident[:256], name=text(getattr(binding, 'display_name', ident) or ident, 200),
                        category='keybinds', group='', type=type(binding).__name__, kind='keybind',
                        value=plain(bound.value), default=plain(default),
                        has_default=hasattr(binding, 'default_key') and valid_key(default),
                        description=text(getattr(binding, 'description', ''), 1500),
                        editable=editable, unit='', can_run=False, source='registered_keybind')
                    row['options'].append(entry)
                    options[(mid, oid)] = (bound, entry)
                    count[0] += 1
                    if not any(c['id'] == 'keybinds' for c in row['categories']):
                        row['categories'].append(dict(id='keybinds', name='Keybinds', label_key='keybinds'))
                used = {e['category'] for e in row['options']}
                row['categories'] = [c for c in row['categories'] if c['id'] in used]
                profile = enrich(mod, row, options, digest)
                if profile is not None:
                    profiles[mid] = profile
                rows.append(row)
            except Exception as error:
                errors.append(type(error).__name__ + ': ' + str(error)[:180])
                # A partially read mod never receives write bindings.
                mods.pop(locals().get('mid'), None)
                for key in list(options):
                    if key[0] == locals().get('mid'):
                        del options[key]
        self.mods, self.options, self.providers = mods, options, profiles
        self.snapshot = {'version': '1.2.0', 'captured_utc': datetime.now(timezone.utc).isoformat(),
                         'mods': rows, 'errors': errors[:32], 'status': 'read',
                         'capabilities': {'mod_metadata': True, 'option_values_read_only': False,
                                          'mod_state_writes': True, 'option_writes': True,
                                          'keybind_writes': True, 'provider_api': 1,
                                          'apply_on': 'native_navigation_deactivate'}}
        return self.snapshot

    def validate_live(self, commands):
        """Preflight ALL requested writes before ANY callback or persistence."""
        self.same_thread()
        current = list(self.base.get_ordered_mod_list())
        prepared = []
        for command in commands:
            mid = command['mod']
            mod, row = self.mods[mid]
            if not any(candidate is mod for candidate in current):
                raise RuntimeError('Mod registry changed: ' + row['name'])
            if text(getattr(mod, 'version', ''), 100) != row['version']:
                raise RuntimeError('Mod version changed: ' + row['name'])
            if mid in self.providers:
                self.providers[mid].check_identity()
            if command['kind'] == 'enabled':
                if bool(getattr(mod, 'enabling_locked', True)) or not equal(getattr(mod, 'is_enabled', None), command['expected']):
                    raise RuntimeError('Mod state changed or locked: ' + row['name'])
                prepared.append((command, mod, None))
            else:
                option, spec = self.options[(mid, command['option'])]
                if command['kind'] == 'value' and (not spec['editable'] or not validate_value(spec, command.get('value'))):
                    raise RuntimeError('Option is readonly or the new value is invalid: ' + spec['name'])
                if command['kind'] == 'action' and not spec['can_run']:
                    raise RuntimeError('Action is unavailable: ' + spec['name'])
                if isinstance(option, LiveKeybind):
                    option.validate()
                    if command['kind'] != 'value' or not spec['editable'] or not valid_key(command.get('value')):
                        raise RuntimeError('Keybind change unavailable: ' + spec['name'])
                    if not equal(option.value, command['expected']):
                        raise RuntimeError('Keybind changed externally: ' + spec['name'])
                    prepared.append((command, mod, option))
                    continue
                if isinstance(option, BoundSetting):
                    option.validate(command.get('value'), action=command['kind'] == 'action')
                    if command['kind'] == 'value' and not equal(plain(option.value), command['expected']):
                        raise RuntimeError('Provider option changed externally: ' + spec['name'])
                    prepared.append((command, mod, option))
                    continue
                # Ensure the current display tree still exposes this exact object.
                source = mod.iter_display_options() if callable(getattr(mod, 'iter_display_options', None)) else mod.options
                seen = set()
                def contains(items, depth=0):
                    if depth > MAX_DEPTH:
                        return False
                    for i, item in enumerate(items):
                        if i >= MAX_OPTIONS:
                            break
                        if id(item) in seen or bool(getattr(item, 'is_hidden', False)):
                            continue
                        seen.add(id(item))
                        if item is option:
                            return not bool(getattr(item, 'is_hidden', False))
                        if kind_of(item) == 'group' and contains(getattr(item, 'children', ()), depth + 1):
                            return True
                    return False
                if not contains(source):
                    raise RuntimeError('Option removed or replaced: ' + spec['name'])
                if command['kind'] == 'value':
                    if not equal(plain(getattr(option, 'value', None)), command['expected']):
                        raise RuntimeError('Option changed externally: ' + spec['name'])
                    if spec['kind'] == 'number' and any(getattr(option, attr, None) != spec[field] for attr, field in [('min_value', 'min'), ('max_value', 'max'), ('step', 'step')]) or spec['kind'] == 'number' and bool(getattr(option, 'is_integer', False)) != spec['integer']:
                        raise RuntimeError('Option bounds changed: ' + spec['name'])
                    if spec['kind'] == 'choice' and list(option.choices) != spec['choices']:
                        raise RuntimeError('Option choices changed: ' + spec['name'])
                elif not callable(getattr(option, 'on_press', None)):
                    raise RuntimeError('Action unavailable: ' + spec['name'])
                prepared.append((command, mod, option))
        return prepared

    def apply(self, commands):
        result = {'status': 'applied', 'completed': [], 'errors': [], 'saved_mods': [],
                  'persistence': [], 'atomic': False}
        try:
            prepared = self.validate_live(commands)
            order = {mid: provider.ordered([c for c in commands if c['mod'] == mid and c['kind'] != 'enabled'])
                     for mid, provider in self.providers.items() if any(c['mod'] == mid for c in commands)}
        except Exception as error:
            result.update(status='refused', errors=[type(error).__name__ + ': ' + str(error)[:300]])
            return result

        def priority(item):
            command, _, _ = item
            mid = command['mod']
            if command['kind'] == 'enabled':
                # An integrated mod keeps its own write authorization until its
                # settings have been applied and persisted, then may be disabled.
                return (5 if command['value'] else 4 if mid in self.providers else 0, mid, 0)
            return (2, mid, order.get(mid, {}).get(command.get('option'), 256))
        prepared.sort(key=priority)
        dirty = {}

        def persist(mid):
            mod = dirty.pop(mid)
            state = {'mod': mid, 'provider': 'not_required', 'sdk': 'pending'}
            errors = []
            provider = self.providers.get(mid)
            if (not any(candidate is mod for candidate in self.base.get_ordered_mod_list()) or
                    text(getattr(mod, 'version', ''), 100) != self.mods[mid][1]['version']):
                state.update(provider='refused', sdk='refused')
                result['persistence'].append(state)
                result['status'] = 'partial'
                result['errors'].append('Persistence refused: mod registration/version changed during application')
                return False
            if provider is not None and provider.saver is not None:
                try:
                    provider.save()
                    state['provider'] = 'saved'
                except Exception as error:
                    state['provider'] = 'failed'
                    errors.append('Provider persistence: ' + type(error).__name__ + ': ' + str(error)[:250])
            try:
                mod.save_settings()
                state['sdk'] = 'saved'
            except Exception as error:
                state['sdk'] = 'failed'
                errors.append('SDK persistence: ' + type(error).__name__ + ': ' + str(error)[:250])
            result['persistence'].append(state)
            if errors:
                result['status'] = 'partial'
                result['errors'].extend(errors)
            else:
                result['saved_mods'].append(mid)
            return not errors

        for command, mod, option in prepared:
            try:
                self.validate_live([command])
                mid = command['mod']
                if command['kind'] == 'enabled':
                    if mid in self.providers and mid in dirty and not persist(mid):
                        break
                    getattr(mod, 'enable' if command['value'] else 'disable')()
                    if getattr(mod, 'is_enabled', None) is not command['value']:
                        raise RuntimeError('Mod did not retain requested state')
                elif command['kind'] == 'value':
                    # Mark before the callback: a failing setter can have changed
                    # part of its state, which still needs truthful persistence.
                    dirty[mid] = mod
                    if isinstance(option, BoundSetting):
                        option.set_value(command['value'])
                    else:
                        option.value = command['value']
                    if not equal(plain(option.value), command['value']):
                        raise RuntimeError('Option did not retain requested value')
                else:
                    if isinstance(option, BoundSetting):
                        dirty[mid] = mod
                    option.on_press(option)
                result['completed'].append(command)
            except Exception as error:
                result['status'] = 'partial'
                result['errors'].append(type(error).__name__ + ': ' + str(error)[:300])
                break
        for mid in list(dirty):
            persist(mid)
        return result


def capture(base):
    return Registry(base).capture()
