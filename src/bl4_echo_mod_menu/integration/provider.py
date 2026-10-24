"""Discover and bind one optional provider on an already registered SDK mod.

No global registration table, imports of other mods, hooks or polling. Captures
own their bindings until inventory close. Replacing/removing a provider or mod
invalidates old drafts. Bad declarations fall back to the ordinary SDK catalog.
"""
from __future__ import annotations
from copy import deepcopy
import inspect
from threading import get_ident
from . import API_VERSION, PROVIDER_ATTRIBUTE
from .contract import (InvalidProvider, identifier, sequence, localized,
                       presentation, scalar, state_token, value_shape, validate_value)

TOP_FIELDS = {'api_version', 'id', 'revision', 'categories', 'options', 'settings',
              'validate', 'save', 'order', 'name', 'description', 'unavailable_reason'}
PRESENTATION = {'name', 'description', 'group', 'unit', 'enabled_when', 'visible_when',
                'true_text', 'false_text', 'choice_labels'}


def function(source, key, args=(), required=False):
    value = source.get(key)
    if value is None and not required:
        return None
    if not callable(value):
        raise InvalidProvider('Expected callback: ' + key)
    try:
        inspect.signature(value).bind(*args)
    except (TypeError, ValueError) as error:
        raise InvalidProvider('Incompatible callback: ' + key) from error
    return value


class BoundSetting:
    """A mod-owned callback binding. This object never enters the HTTP catalog."""
    def __init__(self, session, source, entry):
        self.session, self.source, self.entry = session, source, entry
        self.read = function(source, 'read', required=entry['kind'] != 'action')
        self.write = function(source, 'write', (None,))
        self.run = function(source, 'run', required=entry['kind'] == 'action')
        self.validator = function(source, 'validate', (None,))
        if entry['kind'] in ('readonly', 'action') and self.write is not None:
            raise InvalidProvider('Readonly/action settings cannot declare write')

    @property
    def value(self):
        self.session.same_thread()
        return self.read() if self.read is not None else None

    def validate(self, value=None, action=False):
        self.session.validate()
        if action:
            if not self.entry['can_run'] or self.run is None:
                raise RuntimeError('Provider action unavailable')
            return
        if not self.entry['editable'] or self.write is None or not validate_value(self.entry, value):
            raise RuntimeError('Provider value unavailable or outside its declared bounds')
        if self.validator is not None and self.validator(value) is False:
            raise RuntimeError('Provider validation refused: ' + self.entry['identifier'])

    def set_value(self, value):
        self.validate(value)
        if self.write(value) is False:
            raise RuntimeError('Provider setter refused: ' + self.entry['identifier'])

    def on_press(self, ignored=None):
        self.validate(action=True)
        if self.run() is False:
            raise RuntimeError('Provider action refused: ' + self.entry['identifier'])


class ProviderSession:
    def __init__(self, mod, source):
        self.mod, self.source, self.thread = mod, source, get_ident()
        if type(source) is not dict or set(source) - TOP_FIELDS:
            raise InvalidProvider('Provider must be an API v1 declaration dictionary')
        if type(source.get('api_version')) is not int or source['api_version'] != API_VERSION:
            raise InvalidProvider('Unsupported ECHO Menu API version')
        self.id = identifier(source.get('id'))
        revision = source.get('revision', 1)
        if type(revision) not in (int, str) or len(str(revision)) > 128:
            raise InvalidProvider('Invalid provider revision')
        self.token = state_token(source)
        self.validator = function(source, 'validate')
        self.saver = function(source, 'save')
        self.orderer = function(source, 'order', ({},))
        self.available = self.validator is None or self.validator() is not False
        self.entries = {}
        self.bound = {}

    def same_thread(self):
        if get_ident() != self.thread:
            raise RuntimeError('Provider access outside its capture game thread')

    def check_identity(self):
        self.same_thread()
        if (getattr(self.mod, PROVIDER_ATTRIBUTE, None) is not self.source or
                state_token(self.source) != self.token):
            raise RuntimeError('Provider removed, replaced or changed; reopen the inventory')

    def validate(self):
        self.check_identity()
        if self.validator is not None and self.validator() is False:
            raise RuntimeError('Provider is currently unavailable')

    def ordered(self, commands):
        self.check_identity()
        changes = {self.entries[c['option']]['identifier']: c.get('value')
                   for c in commands if c.get('option') in self.entries}
        ids = list(changes)
        if self.orderer is not None and changes:
            # Ordering is pure metadata logic. Public SDK options/keybinds keep
            # their SDK authorization even when advanced callbacks are readonly.
            ids = list(sequence(self.orderer(dict(changes)), 'order result'))
            if any(type(i) is not str for i in ids) or len(ids) != len(changes) or set(ids) != set(changes):
                raise RuntimeError('Provider order must contain each changed setting exactly once')
        ranks = {key: rank for rank, key in enumerate(ids)}
        return {oid: ranks[entry['identifier']] for oid, entry in self.entries.items()
                if entry['identifier'] in ranks}

    def save(self):
        # Persistence may follow a mod disable. Identity/thread remain mandatory;
        # the mod's save callback owns any additional lifetime/build requirements.
        self.check_identity()
        if self.saver is not None and self.saver() is False:
            raise RuntimeError('Provider persistence refused')

    def decorate(self, row, bindings, digest):
        mid = row['id']
        categories, category_ids = [], set()
        for source in sequence(self.source.get('categories', []), 'categories', 64):
            if type(source) is not dict or set(source) - {'id', 'name', 'presets'}:
                raise InvalidProvider('Invalid category declaration')
            cid = identifier(source.get('id'))
            if cid in category_ids or cid in ('general', 'keybinds'):
                raise InvalidProvider('Duplicate/reserved category')
            category_ids.add(cid)
            category = {'id': 'provider:' + self.id + ':' + cid}
            localized(category, 'name', source.get('name', cid), cid, 200)
            categories.append(category)

        def category(source, kind):
            cid = source.get('category', 'general')
            if kind == 'keybind':
                return 'keybinds'
            if cid in ('general', 'keybinds'):
                if cid == 'keybinds':
                    raise InvalidProvider('Only registered keybinds belong in Keybinds')
                return cid
            if cid not in category_ids:
                raise InvalidProvider('Unknown category: ' + str(cid))
            return 'provider:' + self.id + ':' + cid

        entries, named, seen_targets = [], {}, set()
        original = row['options']
        def add(entry, sid):
            if sid in named:
                raise InvalidProvider('Duplicate setting id: ' + sid)
            named[sid] = entry
            entries.append(entry)
            self.entries[entry['id']] = entry

        for source in sequence(self.source.get('options', []), 'options'):
            allowed = PRESENTATION | {'id', 'option', 'keybind', 'category', 'editable'}
            if type(source) is not dict or set(source) - allowed or ('option' in source) == ('keybind' in source):
                raise InvalidProvider('Invalid SDK option metadata')
            sid = identifier(source.get('id'))
            target = source.get('option', source.get('keybind'))
            from ..menu.keybinds import LiveKeybind
            matches = [(oid, obj, entry) for (owner, oid), (obj, entry) in bindings.items()
                       if owner == mid and ((isinstance(obj, LiveKeybind) and obj.binding is target
                                            and 'keybind' in source) or
                                           (not isinstance(obj, LiveKeybind) and obj is target and 'option' in source))]
            if len(matches) != 1 or id(target) in seen_targets:
                raise InvalidProvider('SDK option must be visible, unique and owned by this mod')
            seen_targets.add(id(target))
            oid, obj, entry = matches[0]
            entry.update(identifier=sid, category=category(source, entry['kind']))
            if type(source.get('editable', True)) is not bool:
                raise InvalidProvider('editable must be a boolean')
            entry['editable'] = entry['editable'] and source.get('editable', True)
            if source.get('editable') is False:
                entry['can_run'] = False
            presentation(entry, source)
            add(entry, sid)

        for source in sequence(self.source.get('settings', []), 'settings'):
            allowed = PRESENTATION | {'id', 'kind', 'category', 'min', 'max', 'step', 'integer',
                'choices', 'default', 'read', 'write', 'run', 'validate', 'hidden', 'editable'}
            if type(source) is not dict or set(source) - allowed:
                raise InvalidProvider('Invalid advanced setting declaration')
            sid = identifier(source.get('id'))
            if type(source.get('hidden', False)) is not bool or type(source.get('editable', True)) is not bool:
                raise InvalidProvider('hidden/editable must be booleans')
            if source.get('hidden', False):
                continue
            if sid in {e['identifier'] for e in original if e['id'] not in self.entries}:
                raise InvalidProvider('Advanced setting shadows a visible SDK option')
            entry = dict(value_shape(source), id=digest(mid + '/provider/' + self.id + '/' + sid),
                identifier=sid, name=sid, category=category(source, source['kind']), group='',
                description='', unit='', type='EchoProviderSetting', value=None,
                editable=False, can_run=False, source='mod_provider')
            presentation(entry, source)
            bound = BoundSetting(self, source, entry)
            if entry['kind'] != 'action':
                value = bound.value
                if not validate_value(entry, value):
                    raise InvalidProvider('Invalid live advanced value: ' + sid)
                entry['value'] = value
            entry['editable'] = (entry['kind'] not in ('readonly', 'action') and bound.write is not None
                                 and self.available and source.get('editable', True))
            entry['can_run'] = entry['kind'] == 'action' and self.available and source.get('editable', True)
            if (bound.write is not None or bound.run is not None) and self.saver is None:
                raise InvalidProvider('Writable advanced providers must declare save')
            bindings[(mid, entry['id'])] = (bound, entry)
            self.bound[sid] = bound
            add(entry, sid)

        entries.extend(e for e in original if e['id'] not in self.entries)
        if len(entries) > 256:
            raise InvalidProvider('Combined option count exceeds 256')
        all_named = {}
        for entry in entries:
            all_named.setdefault(entry['identifier'], []).append(entry)
        for entry in entries:
            for field in ('enabled_when', 'visible_when'):
                if field in entry and len(all_named.get(entry[field]['id'], [])) != 1:
                    raise InvalidProvider('Condition target is missing or ambiguous')
        by_id = {entry['identifier']: entry for entry in entries}
        for source, compiled in zip(self.source.get('categories', []), categories):
            compiled['presets'] = []
            seen_presets = set()
            for preset in sequence(source.get('presets', []), 'presets', 32):
                if type(preset) is not dict or set(preset) - {'id', 'name', 'values'}:
                    raise InvalidProvider('Invalid preset declaration')
                pid = identifier(preset.get('id'))
                if pid in seen_presets:
                    raise InvalidProvider('Duplicate preset id')
                seen_presets.add(pid)
                values = preset.get('values')
                if type(values) is not dict or not values or len(values) > 256:
                    raise InvalidProvider('Preset values must be a bounded dictionary')
                for key, value in values.items():
                    spec = by_id.get(key)
                    if (spec is None or spec['category'] != compiled['id'] or
                            spec['kind'] in ('readonly', 'action', 'keybind') or not validate_value(spec, value)):
                        raise InvalidProvider('Preset target/value is invalid: ' + str(key))
                item = {'id': pid, 'label': pid, 'values': dict(values)}
                localized(item, 'label', preset.get('name', pid), pid, 200)
                compiled['presets'].append(item)
        used = {entry['category'] for entry in entries}
        categories = [c for c in categories if c['id'] in used]
        categories.extend(c for c in row['categories'] if c['id'] in used and not any(n['id'] == c['id'] for n in categories))
        if 'general' in used and not any(c['id'] == 'general' for c in categories):
            categories.append({'id': 'general', 'name': '', 'label_key': 'general'})
        if 'keybinds' in used and not any(c['id'] == 'keybinds' for c in categories):
            categories.append({'id': 'keybinds', 'name': 'Keybinds', 'label_key': 'keybinds'})
        row.update(options=entries, categories=categories,
                   integration={'status': 'active', 'id': self.id, 'api_version': API_VERSION,
                                'revision': self.source.get('revision', 1), 'available': self.available,
                                'advanced_settings': len(self.bound)})
        for field in ('name', 'description'):
            if field in self.source:
                localized(row, field, self.source[field], row[field], 200 if field == 'name' else 1500)
        if not self.available:
            if 'unavailable_reason' not in self.source:
                row['integration_notice_key'] = 'providerReadOnly'
            localized(row, 'integration_notice', self.source.get('unavailable_reason', {
                'en': 'This mod currently permits reading its additional settings only.',
                'de': 'Diese Mod erlaubt derzeit nur das Lesen ihrer zusätzlichen Einstellungen.'}), limit=1500)
        self.check_identity()


def enrich(mod, row, bindings, digest):
    source = getattr(mod, PROVIDER_ATTRIBUTE, None)
    if source is None:
        row['integration'] = {'status': 'automatic', 'api_version': API_VERSION}
        return None
    # Transactional decoration: a malformed optional integration must not remove
    # or partially overwrite the mod's valid ordinary SDK bindings.
    candidate = deepcopy(row)
    candidate_bindings = {key: (obj, next((e for e in candidate['options'] if e['id'] == entry['id']), entry))
                          for key, (obj, entry) in bindings.items()}
    try:
        session = ProviderSession(mod, source)
        session.decorate(candidate, candidate_bindings, digest)
    except Exception as error:
        row['integration'] = {'status': 'fallback', 'api_version': API_VERSION,
                              'error': type(error).__name__ + ': ' + str(error)[:240]}
        localized(row, 'integration_notice', {
            'en': 'The optional menu integration is unavailable. Standard SDK settings are shown.',
            'de': 'Die optionale Menü-Anbindung ist nicht verfügbar. Die normalen SDK-Einstellungen werden angezeigt.'})
        row['integration_notice_key'] = 'integrationFallback'
        return None
    row.clear()
    row.update(candidate)
    bindings.clear()
    bindings.update(candidate_bindings)
    return session
