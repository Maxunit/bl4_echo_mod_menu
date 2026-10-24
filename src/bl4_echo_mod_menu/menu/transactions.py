"""Plain JSON transaction mailbox. Safe on HTTP worker; no SDK imports/objects."""
from __future__ import annotations
from copy import deepcopy
import math
from threading import RLock
from uuid import uuid4
from .keybinds import valid_key
from ..integration.contract import condition_allows


class Rejected(ValueError):
    pass


def same(a, b):
    return type(a) is type(b) and a == b or type(a) in (int, float) and type(b) in (int, float) and a == b


class Mailbox:
    def __init__(self):
        self.lock = RLock()
        self.epoch = ''
        self.active = False
        self.catalog = {'mods': [], 'status': 'not_ready', 'errors': []}
        self.pending = []
        self.revision = 0
        self.last_result = None
        self.accepted = 0

    def open(self, catalog):
        with self.lock:
            self.epoch = uuid4().hex
            self.active = True
            self.catalog = deepcopy(catalog)
            self.pending, self.revision = [], 0
            return self.snapshot()

    def snapshot(self):
        with self.lock:
            return {'epoch': self.epoch, 'active': self.active,
                    'catalog': deepcopy(self.catalog), 'pending': deepcopy(self.pending),
                    'queue_revision': self.revision, 'last_result': deepcopy(self.last_result)}

    def stage(self, body):
        with self.lock:
            if not self.active or body.get('epoch') != self.epoch:
                raise Rejected('session_closed')
            if type(body.get('queue_revision')) is not int or body['queue_revision'] != self.revision:
                raise Rejected('revision_changed')
            commands = body.get('commands')
            if not isinstance(commands, list) or len(commands) > 256:
                raise Rejected('invalid_commands')
            mods = {row['id']: row for row in self.catalog['mods']}
            checked, unique = [], set()
            for command in commands:
                if not isinstance(command, dict) or command.get('kind') not in ('enabled', 'value', 'action'):
                    raise Rejected('invalid_command')
                kind, mid = command['kind'], command.get('mod')
                if not isinstance(mid, str) or mid not in mods:
                    raise Rejected('unknown_mod')
                row = mods[mid]
                spec = None
                key = (kind, mid, command.get('option', ''))
                if not all(isinstance(part, str) for part in key) or key in unique:
                    raise Rejected('duplicate_or_invalid_target')
                unique.add(key)
                clean = {'kind': kind, 'mod': mid}
                if kind == 'enabled':
                    if not row['can_toggle'] or type(command.get('value')) is not bool:
                        raise Rejected('mod_locked')
                    value, expected = command['value'], row['enabled']
                else:
                    oid = command.get('option')
                    spec = next((o for o in row['options'] if o['id'] == oid), None)
                    if spec is None:
                        raise Rejected('unknown_option')
                    clean['option'] = oid
                    if kind == 'action':
                        if not spec['can_run']:
                            raise Rejected('action_unavailable')
                        checked.append(clean)
                        continue
                    if not spec['editable']:
                        raise Rejected('option_readonly')
                    value, expected = command.get('value'), spec['value']
                    if spec['kind'] == 'boolean' and type(value) is not bool:
                        raise Rejected('invalid_boolean')
                    if spec['kind'] == 'number':
                        if type(value) not in (int, float) or type(value) is float and not math.isfinite(value) or not spec['min'] <= value <= spec['max']:
                            raise Rejected('number_out_of_range')
                        if spec['integer'] and int(value) != value:
                            raise Rejected('integer_required')
                        value = int(value) if spec['integer'] else float(value)
                    if spec['kind'] == 'choice' and (type(value) is not str or value not in spec['choices']):
                        raise Rejected('invalid_choice')
                    if spec['kind'] == 'keybind' and not valid_key(value):
                        raise Rejected('invalid_key_identifier')
                if not same(command.get('expected'), expected):
                    raise Rejected('baseline_changed')
                if same(value, expected):
                    continue
                clean.update(value=value, expected=expected)
                checked.append(clean)
            # Conditions are plain declarations: HTTP validates them against the
            # baseline plus the complete proposed draft, never by invoking a mod.
            for row in mods.values():
                baseline = {entry['identifier']: entry['value'] for entry in row['options']}
                planned = dict(baseline)
                targets = {entry['id']: entry for entry in row['options']}
                for command in checked:
                    if command['mod'] == row['id'] and command['kind'] == 'value':
                        planned[targets[command['option']]['identifier']] = command['value']
                for command in checked:
                    if command['mod'] != row['id'] or command['kind'] == 'enabled':
                        continue
                    spec = targets[command['option']]
                    if any(not condition_allows(spec.get(field), baseline, planned)
                           for field in ('enabled_when', 'visible_when')):
                        if not any(previous == command for previous in self.pending):
                            raise Rejected('option_condition_unavailable')
            self.pending = checked
            self.revision += 1
            self.accepted += 1
            return self.snapshot()

    def close(self):
        """Called by the game thread at native inventory-navigation deactivate."""
        with self.lock:
            if not self.active:
                return None
            self.active = False
            commands, self.pending = self.pending, []
            return {'epoch': self.epoch, 'queue_revision': self.revision, 'commands': commands}

    def finish(self, request, result, catalog):
        with self.lock:
            self.last_result = dict(result, epoch=request['epoch'], queue_revision=request['queue_revision'])
            self.catalog = deepcopy(catalog)

    def cancel(self):
        with self.lock:
            count = len(self.pending)
            self.pending, self.active = [], False
            if count:
                self.last_result = {'status': 'cancelled', 'count': count, 'reason': 'controller_stopped'}
            return count
