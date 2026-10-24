from pathlib import Path as _ProjectPath
import sys as _project_sys
_project_sys.path.insert(0,str(_ProjectPath(__file__).resolve().parent.parent/"tools"))
"""Meaningful SDK transaction/lifecycle regressions and actual local HTTP transport."""
from contextlib import contextmanager
import http.client
import json
from pathlib import Path
import sys
import tempfile
from threading import Thread, get_ident
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent
from test_bootstrap import prepare_package
prepare_package()
from bl4_echo_mod_menu.menu import catalog, controller, server
from bl4_echo_mod_menu.menu.transactions import Mailbox, Rejected

MAIN = get_ident()


class Value:
    def __init__(self, identifier, value, **attrs):
        self.identifier = self.display_name = identifier
        self.is_hidden, self.description = False, ''
        self.calls, self.fail = [], False
        self.value = self.default_value = value
        self.__dict__.update(attrs)
    def __setattr__(self, key, value):
        if key == 'value' and key in self.__dict__:
            self.calls.append((get_ident(), value))
            if self.fail:
                raise RuntimeError('fixture callback refused')
        object.__setattr__(self, key, value)


class BoolOption(Value): pass
class HiddenOption(Value): pass
class SliderOption(Value): pass
class SpinnerOption(Value): pass
class KeybindOption(Value): pass
class GroupedOption:
    def __init__(self, name, children):
        self.identifier = self.display_name = name
        self.children, self.is_hidden = children, False
class ButtonOption:
    def __init__(self):
        self.identifier = self.display_name = 'Action'
        self.is_hidden, self.description, self.calls = False, '', []
        self.on_press = lambda option: self.calls.append((get_ident(), option is self))


class Mod:
    def __init__(self):
        self.name, self.version, self.author = 'Fixture Mod', '1', 'Example author'
        self.description = '<b>Components:</b><br>Base: 1.12<br/>Other: 2'
        self.is_enabled, self.enabling_locked = True, False
        self.settings_file, self.mod_type = Path('fixture.json'), 'Standard'
        self.calls, self.fail_save = [], False
        self.number = SliderOption('Range', 3, min_value=-10, max_value=10, step=1, is_integer=True)
        self.boolean = BoolOption('Flag', True)
        self.choice = SpinnerOption('Choice', 'A', choices=['A', 'B'])
        self.action = ButtonOption()
        self.options = [GroupedOption('Config', [self.number, self.boolean, self.choice, self.action]), KeybindOption('Binding', 'F5')]
    def iter_display_options(self): return iter(self.options)
    def get_status(self): return '<b>Enabled</b>' if self.is_enabled else 'Disabled'
    def enable(self): self.calls.append(('enable', get_ident())); self.is_enabled = True
    def disable(self): self.calls.append(('disable', get_ident())); self.is_enabled = False
    def save_settings(self):
        self.calls.append(('save', get_ident()))
        if self.fail_save: raise OSError('fixture persistence failed')


class Hooks:
    Type = SimpleNamespace(POST=1)
    def __init__(self): self.rows, self.mode, self.block_remove = {}, 'normal', False
    def add_hook(self, path, kind, ident, callback):
        key = (path, kind, ident)
        if key in self.rows: return False
        collection = any(p == path and k == kind for p, k, _ in self.rows)
        if ident == controller.HOOK_ID and self.mode == 'absent': return True
        self.rows[key] = callback
        if ident == controller.HOOK_ID and self.mode == 'insert_raise': raise RuntimeError('inserted then raised')
        return not collection  # SDK 3.2.0 second-hook regression.
    def has_hook(self, path, kind, ident): return (path, kind, ident) in self.rows
    def remove_hook(self, path, kind, ident):
        if self.block_remove and ident == controller.HOOK_ID: return False
        return self.rows.pop((path, kind, ident), None) is not None


class Tests(unittest.TestCase):
    def registry(self):
        mod = Mod(); listing = [mod]
        base = SimpleNamespace(get_ordered_mod_list=lambda: listing)
        registry = catalog.Registry(base); snapshot = registry.capture()
        return mod, listing, registry, snapshot

    def mailbox(self):
        mod, listing, registry, snapshot = self.registry()
        mailbox = Mailbox(); mailbox.open(snapshot)
        return mod, listing, registry, mailbox

    def command(self, mailbox, name='Range', value=5):
        row = mailbox.catalog['mods'][0]
        option = next(o for o in row['options'] if o['name'] == name)
        return dict(kind='value', mod=row['id'], option=option['id'], expected=option['value'], value=value)

    def stage(self, mailbox, commands):
        return mailbox.stage(dict(epoch=mailbox.epoch, queue_revision=mailbox.revision, commands=commands))

    def test_schema_groups_types_hidden_cycle_and_description(self):
        mod, listing, registry, snap = self.registry()
        mod.options.insert(0, BoolOption('Top-level', False))
        group = mod.options[1]; group.children.append(HiddenOption('Secret', 2)); group.children.append(group)
        row = registry.capture()['mods'][0]
        self.assertEqual(len(row['categories']), 3)
        self.assertEqual(len(row['options']), 6)
        self.assertEqual(row['description'], 'Components:\nBase: 1.12\nOther: 2')
        self.assertNotEqual(row['options'][0]['category'], row['options'][1]['category'])
        self.assertEqual(next(o for o in row['options'] if o['name']=='Range')['min'], -10)
        self.assertFalse(next(o for o in row['options'] if o['kind']=='keybind')['editable'])
        self.assertEqual(next(o for o in row['options'] if o['kind']=='keybind')['category'], 'keybinds')
        self.assertTrue(row['can_toggle'])
        json.dumps(row, allow_nan=False)

    def test_locked_mod_not_toggleable(self):
        mod, _, registry, _ = self.registry(); mod.enabling_locked = True
        mailbox = Mailbox(); mailbox.open(registry.capture())
        row = mailbox.catalog['mods'][0]
        with self.assertRaises(Rejected): self.stage(mailbox, [dict(kind='enabled',mod=row['id'],expected=True,value=False)])
        self.assertTrue(mod.is_enabled)

    def test_mailbox_rejects_bad_types_ranges_choices_and_readonly(self):
        for name, value in [('Range', True), ('Range', 100), ('Range', float('nan')), ('Range', 10**500), ('Range', 2.5), ('Flag', 1), ('Choice', 'Z'), ('Binding', 'F6')]:
            with self.subTest(name=name,value=str(value)[:20]):
                mod, _, _, mailbox = self.mailbox()
                with self.assertRaises(Rejected): self.stage(mailbox,[self.command(mailbox,name,value)])
                self.assertFalse(mailbox.pending)
                self.assertFalse(mod.number.calls)

    def test_queue_replacement_revision_close_and_cancel(self):
        mod, _, registry, mailbox = self.mailbox()
        old_epoch = mailbox.epoch
        self.stage(mailbox,[self.command(mailbox,value=5)])
        with self.assertRaises(Rejected): mailbox.stage(dict(epoch=old_epoch,queue_revision=0,commands=[]))
        self.stage(mailbox,[self.command(mailbox,value=7)])
        request = mailbox.close(); self.assertEqual(request['commands'][0]['value'],7)
        self.assertIsNone(mailbox.close())
        with self.assertRaises(Rejected): self.stage(mailbox,[])
        mailbox.open(registry.capture())
        with self.assertRaises(Rejected): mailbox.stage(dict(epoch=old_epoch,queue_revision=0,commands=[]))
        self.stage(mailbox,[self.command(mailbox,value=5)])
        self.assertEqual(mailbox.cancel(),1); self.assertFalse(mod.number.calls)

    def test_duplicate_and_baseline_rejection(self):
        _, _, _, mailbox = self.mailbox(); command=self.command(mailbox)
        with self.assertRaises(Rejected):self.stage(mailbox,[command,command])
        command['expected']=9
        with self.assertRaises(Rejected):self.stage(mailbox,[command])

    def test_apply_callback_once_and_persistence(self):
        mod, _, registry, mailbox=self.mailbox()
        self.stage(mailbox,[self.command(mailbox,value=6),self.command(mailbox,'Choice','B')])
        result=registry.apply(mailbox.close()['commands'])
        self.assertEqual(result['status'],'applied'); self.assertEqual(mod.number.value,6)
        self.assertEqual(mod.number.calls,[(MAIN,6)]);self.assertEqual(mod.choice.calls,[(MAIN,'B')])
        self.assertEqual(mod.calls,[('save',MAIN)])

    def test_disable_configure_enable_order_and_action_once(self):
        mod, _, registry, mailbox=self.mailbox(); mid=mailbox.catalog['mods'][0]['id']
        action=next(o for o in mailbox.catalog['mods'][0]['options'] if o['kind']=='action')
        self.stage(mailbox,[dict(kind='enabled',mod=mid,expected=True,value=False),self.command(mailbox,value=8),dict(kind='action',mod=mid,option=action['id'])])
        result=registry.apply(mailbox.close()['commands'])
        self.assertEqual(result['status'],'applied');self.assertEqual(mod.calls[0],('disable',MAIN))
        self.assertFalse(mod.is_enabled);self.assertEqual(mod.number.value,8);self.assertEqual(mod.action.calls,[(MAIN,True)])

    def test_external_change_preflight_prevents_all_writes(self):
        mod, _, registry, mailbox=self.mailbox()
        self.stage(mailbox,[self.command(mailbox,value=7),self.command(mailbox,'Choice','B')])
        mod.choice.value='External'; mod.choice.calls=[]
        result=registry.apply(mailbox.close()['commands'])
        self.assertEqual(result['status'],'refused');self.assertFalse(mod.number.calls);self.assertFalse(mod.calls)

    def test_mod_option_replacement_hidden_parent_and_range_change(self):
        for mode in ['mod','option','hidden','range']:
            with self.subTest(mode=mode):
                mod, listing, registry, mailbox=self.mailbox();self.stage(mailbox,[self.command(mailbox)])
                if mode=='mod':listing[:]=[Mod()]
                if mode=='option':mod.options[0].children[0]=SliderOption('Range',3,min_value=-10,max_value=10,step=1,is_integer=True)
                if mode=='hidden':mod.options[0].is_hidden=True
                if mode=='range':mod.number.max_value=4
                result=registry.apply(mailbox.close()['commands'])
                self.assertEqual(result['status'],'refused');self.assertFalse(mod.number.calls)

    def test_partial_callback_and_persistence_failures_are_truthful(self):
        mod, _, registry, mailbox=self.mailbox();mod.choice.fail=True
        self.stage(mailbox,[self.command(mailbox,value=8),self.command(mailbox,'Choice','B')])
        result=registry.apply(mailbox.close()['commands'])
        self.assertEqual(result['status'],'partial');self.assertEqual(mod.number.value,8)
        self.assertEqual(mod.choice.value,'A');self.assertEqual(len(result['completed']),1)
        self.assertEqual(mod.calls,[('save',MAIN)])
        mod, _, registry, mailbox=self.mailbox();mod.fail_save=True
        self.stage(mailbox,[self.command(mailbox,value=8)])
        result=registry.apply(mailbox.close()['commands'])
        self.assertEqual(result['status'],'partial');self.assertEqual(mod.number.value,8)
        self.assertFalse(result['saved_mods'])

    @contextmanager
    def runtime(self, mode='normal', shared=False, preexisting=False):
        mod, listing, _, _=self.registry(); calls=[]; logs=[]; hooks=Hooks();hooks.mode=mode
        def getter():calls.append(get_ident());return listing
        sdk=SimpleNamespace(hooks=hooks,logging=SimpleNamespace(info=logs.append,error=logs.append))
        scene=SimpleNamespace(_active=None)
        paths=['/Test:Activate','/Test:Deactivate']
        def scene_start(*a):
            if scene._active is None:
                scene._active=object()
                for p in paths:hooks.add_hook(p,1,'scene',lambda *a:None)
            return True
        def scene_stop():
            for p in paths:hooks.remove_hook(p,1,'scene')
            scene._active=None;return True
        scene.start,scene.stop=scene_start,scene_stop
        if shared:scene_start()
        foreign=lambda *a:None
        if preexisting:hooks.rows[(paths[0],1,controller.HOOK_ID)]=foreign
        original=server.MenuService;services=[]
        with tempfile.TemporaryDirectory() as tmp:
            def make():
                value=original(port=0,directory=tmp);services.append(value);return value
            with patch.dict(sys.modules,{'unrealsdk':sdk,'mods_base':SimpleNamespace(get_ordered_mod_list=getter),'bl4_echo_mod_menu.scene.lifecycle':scene}),patch.object(server,'MenuService',side_effect=make),patch.object(controller,'hook_metadata',return_value=[dict(path=paths[0],mode='apply'),dict(path=paths[1],mode='release')]),patch.object(controller,'require_tag_config',return_value={'status':'isolated_controller_boundary'}):
                try:yield SimpleNamespace(mod=mod,calls=calls,hooks=hooks,scene=scene,services=services,logs=logs,foreign=foreign)
                finally:
                    hooks.block_remove=False;self.assertTrue(controller.stop());scene_stop()
                    for r in services:self.assertFalse(r.thread.is_alive())

    def event(self, session, mode, name, cls=controller.SCRIPT_CLASS):
        return session.on_event(mode,SimpleNamespace(Class=SimpleNamespace(_path_name=lambda:cls)),SimpleNamespace(OwningWidgetDef=SimpleNamespace(_name=name)))

    def http(self, service, route, value):
        con=http.client.HTTPConnection('127.0.0.1',service.http.server_port,timeout=3)
        con.request('POST',server.PREFIX+route,json.dumps(dict(token=server.BUILD_TOKEN,**value)))
        response=con.getresponse();status=response.status;value=json.loads(response.read());con.close();return status,value

    def test_native_close_only_applies_saved_queue_http_worker_never_sdk(self):
        with self.runtime() as f:
            self.assertTrue(controller.start());s=controller._active
            self.assertEqual(len(f.hooks.rows),4)
            self.assertTrue(all(not r['add_returned'] and r['present_after'] for r in s.service.report['hook_registrations']))
            self.event(s,'apply',controller.OWN)
            status,data=self.http(s.service,'/catalog',{});self.assertEqual(status,200)
            mb=s.service.mailbox;command=self.command(mb,value=9)
            status,reply=self.http(s.service,'/stage',dict(epoch=data['epoch'],queue_revision=0,commands=[command]))
            self.assertEqual(status,200);self.assertEqual(f.mod.number.value,3)
            self.event(s,'release',controller.OWN);self.event(s,'apply',controller.OWN)
            self.assertEqual(mb.epoch,data['epoch']);self.assertEqual(len(mb.pending),1)
            thread=Thread(target=lambda:self.event(s,'release',controller.NAV));thread.start();thread.join()
            self.assertEqual(f.mod.number.value,3)
            self.event(s,'release','foreign');self.event(s,'release',controller.NAV,cls='wrong')
            self.assertEqual(f.mod.number.value,3)
            self.event(s,'release',controller.NAV);self.event(s,'release',controller.NAV)
            self.assertEqual(f.mod.number.value,9);self.assertEqual(f.mod.number.calls,[(MAIN,9)])
            self.assertEqual(s.counts['batches'],1)
            status,late=self.http(s.service,'/stage',dict(epoch=data['epoch'],queue_revision=1,commands=[]));self.assertEqual(status,409)
            self.assertTrue(all(thread==MAIN for thread in f.calls))
            self.event(s,'apply',controller.OWN)
            _,reopened=self.http(s.service,'/catalog',{});self.assertEqual(reopened['last_result']['status'],'applied')
            self.assertNotEqual(reopened['epoch'],data['epoch'])
            self.assertTrue(controller.stop());self.assertFalse(f.hooks.rows)

    def test_stop_cancels_pending_without_any_game_write(self):
        with self.runtime() as f:
            self.assertTrue(controller.start());s=controller._active;self.event(s,'apply',controller.OWN)
            self.stage(s.service.mailbox,[self.command(s.service.mailbox)])
            self.assertTrue(controller.stop());self.assertEqual(f.mod.number.value,3);self.assertFalse(f.mod.calls)
            self.assertEqual(s.service.report['cancelled_on_stop'],1)

    def test_hook_failures_preexisting_and_cleanup_retry(self):
        for mode in ['absent','insert_raise']:
            with self.subTest(mode=mode),self.runtime(mode) as f:
                self.assertFalse(controller.start());self.assertFalse(f.hooks.rows)
        with self.runtime(preexisting=True) as f:
            self.assertFalse(controller.start());self.assertEqual(list(f.hooks.rows.values()),[f.foreign])
        with self.runtime(shared=True) as f:
            self.assertTrue(controller.start());s=controller._active;f.hooks.block_remove=True
            self.assertFalse(controller.stop());self.assertFalse(s.enabled);self.assertFalse(controller.start())
            f.hooks.block_remove=False;self.assertTrue(controller.stop());self.assertEqual(len(f.hooks.rows),2)
            self.assertIsNotNone(f.scene._active)

    def test_preferences_persist_and_no_auth_can_stage(self):
        with self.runtime() as f:
            self.assertTrue(controller.start());r=controller._active.service
            self.assertEqual(self.http(r,'/preferences',{'language':'de'})[0],200)
            self.assertEqual(json.loads(r.preferences_path.read_text()),{'language':'de'})
            self.assertEqual(self.http(r,'/preferences',{'language':'xx'})[0],400)
            self.assertEqual(r.receive_stage({'token':'wrong'})[0],403)


if __name__=='__main__':unittest.main(verbosity=2)
