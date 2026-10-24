from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""API v1 fallback, lifetime, isolation, persistence and transport regressions."""
from copy import deepcopy
import json
from threading import Thread, get_ident
from types import SimpleNamespace
import unittest
from verify_catalog import Mod, BoolOption, SliderOption, HiddenOption
from bl4_echo_mod_menu.menu import catalog
from bl4_echo_mod_menu.menu.transactions import Mailbox, Rejected


def command(row, key, value=None, action=False):
    option = next(o for o in row['options'] if o['identifier'] == key)
    result = dict(kind='action' if action else 'value', mod=row['id'], option=option['id'])
    if not action:
        result.update(expected=option['value'], value=value)
    return result


def fixture():
    mod = Mod()
    state = {'value': 3, 'allowed': True, 'save_error': False, 'write_error': False}
    calls = []
    def read():
        calls.append(('read', get_ident()))
        return state['value']
    def write(value):
        calls.append(('write', get_ident(), value))
        state['value'] = value
        if state['write_error']:
            raise RuntimeError('fixture setter failed after mutation')
    def save():
        calls.append(('custom_save', get_ident(), state['value']))
        if state['save_error']:
            raise OSError('fixture custom store unavailable')
    def reset():
        calls.append(('run', get_ident()))
        state['value'] = 0
    provider = {
        'api_version': 1, 'id': 'fixture.integration', 'revision': 1,
        'categories': [{'id': 'panel', 'name': {'en': 'Panel', 'de': 'Bereich'},
                        'presets': [{'id': 'mixed', 'name': {'en': 'Mixed', 'de': 'Gemischt'},
                                     'values': {'range': 7, 'flag': True, 'choice': 'B'}}]}],
        'options': [{'id': 'range', 'option': mod.number, 'category': 'panel',
                     'name': {'en': 'Range', 'de': 'Abstand'}, 'unit': 'cm'},
                    {'id': 'flag', 'option': mod.boolean, 'category': 'panel'},
                    {'id': 'choice', 'option': mod.choice, 'category': 'panel'}],
        'settings': [{'id': 'extra', 'kind': 'number', 'category': 'panel',
                      'name': {'en': 'Extra', 'de': 'Zusatz'}, 'min': 0, 'max': 20,
                      'step': 1, 'integer': True, 'default': 3, 'read': read, 'write': write,
                      'validate': lambda value: value != 13,
                      'visible_when': {'id': 'flag', 'equals': True}},
                     {'id': 'information', 'kind': 'readonly', 'category': 'panel', 'read': lambda: 'Info'},
                     {'id': 'reset', 'kind': 'action', 'category': 'panel', 'run': reset},
                     {'id': 'secret', 'kind': 'number', 'hidden': True}],
        'validate': lambda: state['allowed'] and mod.is_enabled,
        'save': save,
    }
    mod.echo_menu_provider = provider
    listing = [mod]
    registry = catalog.Registry(SimpleNamespace(get_ordered_mod_list=lambda: listing))
    snapshot = registry.capture()
    return mod, state, calls, provider, listing, registry, snapshot['mods'][0]


class Tests(unittest.TestCase):
    def test_three_levels_are_plain_json_and_preserve_sdk_authority(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        self.assertEqual(row['integration']['status'], 'active')
        self.assertEqual(row['integration']['advanced_settings'], 3)
        number = next(o for o in row['options'] if o['identifier'] == 'range')
        self.assertEqual((number['min'], number['max'], number['step']), (-10, 10, 1))
        self.assertEqual(number['name_i18n']['de'], 'Abstand')
        self.assertEqual(number['unit'], 'cm')
        self.assertFalse(any(o['identifier'] == 'secret' for o in row['options']))
        self.assertEqual(row['categories'][0]['presets'][0]['values']['choice'], 'B')
        json.dumps(registry.snapshot, allow_nan=False)
        del mod.echo_menu_provider
        automatic = registry.capture()['mods'][0]
        self.assertEqual(automatic['integration']['status'], 'automatic')
        self.assertEqual(len(automatic['options']), 5)

    def test_declarative_only_provider_needs_no_callbacks_or_sdk_import(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        provider.pop('settings'); provider.pop('save'); provider.pop('validate')
        row = registry.capture()['mods'][0]
        self.assertEqual(row['integration']['status'], 'active')
        self.assertEqual(registry.apply([command(row, 'range', 8)])['status'], 'applied')
        self.assertEqual(mod.number.value, 8)
        self.assertFalse(any(c[0] == 'custom_save' for c in calls))

    def test_malformed_provider_falls_back_without_losing_other_mods(self):
        modes = ['version', 'duplicate', 'foreign', 'hidden', 'range', 'condition', 'preset',
                 'cycle', 'callback', 'unknown', 'missing_save', 'current_value', 'duplicate_target']
        for mode in modes:
            with self.subTest(mode=mode):
                mod, state, calls, provider, listing, registry, row = fixture()
                if mode == 'version': provider['api_version'] = 999
                if mode == 'duplicate': provider['settings'][0]['id'] = 'range'
                if mode == 'foreign': provider['options'][0]['option'] = Mod().number
                if mode == 'hidden': mod.number.is_hidden = True
                if mode == 'range': provider['settings'][0]['step'] = 0
                if mode == 'condition': provider['settings'][0]['visible_when']['id'] = 'missing'
                if mode == 'preset': provider['categories'][0]['presets'][0]['values']['range'] = 999
                if mode == 'cycle': provider['options'].append(provider)
                if mode == 'callback': provider['settings'][0]['read'] = lambda required: 3
                if mode == 'unknown': provider['extra_field'] = True
                if mode == 'missing_save': provider.pop('save')
                if mode == 'current_value': state['value'] = float('nan')
                if mode == 'duplicate_target': provider['options'].append({'id': 'again', 'option': mod.number})
                other = Mod(); other.name = 'Other mod'; listing.append(other)
                result = registry.capture()
                self.assertEqual(len(result['mods']), 2)
                self.assertEqual(result['errors'], [])
                self.assertEqual(result['mods'][0]['integration']['status'], 'fallback')
                self.assertEqual(result['mods'][1]['integration']['status'], 'automatic')
                self.assertFalse(any(o['identifier'] == 'extra' for o in result['mods'][0]['options']))
                self.assertFalse(any(c[0] == 'write' for c in calls))

    def test_http_mailbox_never_invokes_provider_or_sdk_callbacks(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        box = Mailbox(); box.open(registry.snapshot)
        before = list(calls)
        worker_errors = []
        def worker():
            try:
                box.stage(dict(epoch=box.epoch, queue_revision=0, commands=[command(row, 'extra', 8)]))
            except Exception as error:
                worker_errors.append(error)
        thread = Thread(target=worker); thread.start(); thread.join()
        self.assertFalse(worker_errors)
        self.assertEqual(calls, before)
        self.assertEqual(state['value'], 3)
        result = registry.apply(box.close()['commands'])
        self.assertEqual(result['status'], 'applied')
        self.assertEqual(state['value'], 8)
        self.assertTrue(all(c[1] == get_ident() for c in calls))
        self.assertEqual([c[0] for c in calls].count('write'), 1)
        self.assertEqual([c[0] for c in calls].count('custom_save'), 1)
        self.assertEqual(len(result['saved_mods']), 1)

    def test_full_batch_preflight_refuses_before_any_write(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        result = registry.apply([command(row, 'range', 9), command(row, 'extra', 13)])
        self.assertEqual(result['status'], 'refused')
        self.assertEqual(mod.number.value, 3)
        self.assertFalse(mod.calls)
        self.assertFalse(any(c[0] in ('write', 'custom_save') for c in calls))

    def test_removed_disabled_reloaded_changed_provider_refuses_old_drafts(self):
        for mode in ['mod', 'remove', 'replace', 'revision', 'callback', 'deactivate', 'external']:
            with self.subTest(mode=mode):
                mod, state, calls, provider, listing, registry, row = fixture()
                request = command(row, 'extra', 8)
                if mode == 'mod': listing[:] = [Mod()]
                if mode == 'remove': del mod.echo_menu_provider
                if mode == 'replace': mod.echo_menu_provider = dict(provider)
                if mode == 'revision': provider['revision'] = 2
                if mode == 'callback': provider['settings'][0]['write'] = lambda value: None
                if mode == 'deactivate': mod.is_enabled = False
                if mode == 'external': state['value'] = 4
                result = registry.apply([request])
                self.assertEqual(result['status'], 'refused')
                self.assertFalse(any(c[0] in ('write', 'custom_save') for c in calls))

    def test_unavailable_provider_keeps_public_sdk_options_editable(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        state['allowed'] = False
        row = registry.capture()['mods'][0]
        self.assertFalse(next(o for o in row['options'] if o['identifier'] == 'extra')['editable'])
        self.assertEqual(registry.apply([command(row, 'extra', 8)])['status'], 'refused')
        self.assertEqual(registry.apply([command(row, 'range', 8)])['status'], 'applied')
        self.assertEqual(mod.number.value, 8)

    def test_actions_execute_once_on_apply_and_use_mod_persistence(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        box = Mailbox(); box.open(registry.snapshot)
        box.stage(dict(epoch=box.epoch, queue_revision=0, commands=[command(row, 'reset', action=True)]))
        self.assertEqual(state['value'], 3)
        result = registry.apply(box.close()['commands'])
        self.assertEqual(result['status'], 'applied')
        self.assertEqual(state['value'], 0)
        self.assertEqual([c[0] for c in calls].count('run'), 1)
        self.assertEqual([c[0] for c in calls].count('custom_save'), 1)

    def test_partial_setter_and_separate_stores_are_reported_truthfully(self):
        for mode in ['write', 'provider_save', 'sdk_save']:
            with self.subTest(mode=mode):
                mod, state, calls, provider, listing, registry, row = fixture()
                if mode == 'write': state['write_error'] = True
                if mode == 'provider_save': state['save_error'] = True
                if mode == 'sdk_save': mod.fail_save = True
                result = registry.apply([command(row, 'extra', 8)])
                self.assertEqual(result['status'], 'partial')
                self.assertEqual(state['value'], 8)
                self.assertTrue(result['persistence'])
                self.assertEqual([c[0] for c in mod.calls].count('save'), 1)
                self.assertEqual(result['persistence'][0]['provider'], 'failed' if mode == 'provider_save' else 'saved')
                self.assertEqual(result['persistence'][0]['sdk'], 'failed' if mode == 'sdk_save' else 'saved')

    def test_persist_before_integrated_mod_disable(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        def save():
            self.assertTrue(mod.is_enabled)
            calls.append(('custom_save', get_ident()))
        provider['save'] = save
        row = registry.capture()['mods'][0]
        result = registry.apply([dict(kind='enabled', mod=row['id'], expected=True, value=False),
                                 command(row, 'extra', 9)])
        self.assertEqual(result['status'], 'applied')
        self.assertFalse(mod.is_enabled)
        self.assertEqual([c[0] for c in mod.calls], ['save', 'disable'])

    def test_invalid_order_is_refused_without_writes(self):
        for output in [[], ['range', 'range'], ['other'], 'range']:
            with self.subTest(output=output):
                mod, state, calls, provider, listing, registry, row = fixture()
                provider['order'] = lambda changes: output
                row = registry.capture()['mods'][0]
                self.assertEqual(registry.apply([command(row, 'range', 8)])['status'], 'refused')
                self.assertFalse(mod.number.calls)

    def test_wrong_thread_never_reads_provider_or_sdk_registry(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        before = list(calls); results = []
        thread = Thread(target=lambda: results.append(registry.apply([command(row, 'extra', 8)])))
        thread.start(); thread.join()
        self.assertEqual(results[0]['status'], 'refused')
        self.assertEqual(calls, before)

    def test_conditions_reject_hidden_writes_and_accept_parent_in_same_batch(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        mod.boolean.value = False
        row = registry.capture()['mods'][0]
        box = Mailbox(); box.open(registry.snapshot)
        body = dict(epoch=box.epoch, queue_revision=0, commands=[command(row, 'extra', 8)])
        with self.assertRaises(Rejected): box.stage(body)
        body['commands'].append(command(row, 'flag', True))
        box.stage(body)
        self.assertEqual(len(box.pending), 2)

    def test_previously_accepted_draft_survives_hiding_its_parent(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        mod.boolean.value = False
        row = registry.capture()['mods'][0]
        box = Mailbox(); box.open(registry.snapshot)
        extra = command(row, 'extra', 8)
        box.stage(dict(epoch=box.epoch, queue_revision=0, commands=[extra, command(row, 'flag', True)]))
        box.stage(dict(epoch=box.epoch, queue_revision=1, commands=[extra]))
        self.assertEqual(box.pending, [extra])
        self.assertEqual(registry.apply(box.close()['commands'])['status'], 'applied')

    def test_callback_reload_prevents_persisting_an_unregistered_mod(self):
        mod, state, calls, provider, listing, registry, row = fixture()
        def write(value):
            state['value'] = value
            listing[:] = [Mod()]
        provider['settings'][0]['write'] = write
        row = registry.capture()['mods'][0]
        result = registry.apply([command(row, 'extra', 8)])
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['persistence'][0]['sdk'], 'refused')
        self.assertFalse(any(c[0] == 'custom_save' for c in calls))
        self.assertFalse(mod.calls)


if __name__ == '__main__': unittest.main(verbosity=2)
