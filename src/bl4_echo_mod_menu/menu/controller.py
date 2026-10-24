"""Game-thread catalog/transactions on two validated native lifecycle hooks."""
import importlib
from threading import get_ident
from . import server
from .catalog import Registry
from .hooks import hook_metadata, SCRIPT_CLASS
from ..metadata import distribution_info
from ..native_installation import require_tag_config

_active = None
HOOK_ID = 'ECHO.ModMenu.Catalog'
OWN = 'def_bl4_empty_page_v40'
NAV = 'def_status_menu_nav_bar'


class Session:
    def __init__(self, sdk, base, service):
        self.sdk, self.service = sdk, service
        self.registry = Registry(base)
        self.thread = get_ident()
        self.paths = []
        self.enabled, self.busy, self.owns_scene = False, False, False
        self.counts = {'opens': 0, 'native_closes': 0, 'batches': 0, 'foreign': 0, 'wrong_thread': 0}

    def same_thread(self):
        if get_ident() != self.thread:
            raise RuntimeError('SDK access rejected off the starting game thread')

    def publish(self, value):
        with self.service.lock:
            self.service.catalog = value
            self.service.artwork = dict(self.registry.artwork)
            self.service.report['catalog'] = value
            self.service.report['counts'] = dict(self.counts)

    def refresh(self):
        self.same_thread()
        if self.service.mailbox.active:
            return self.service.mailbox.snapshot()['catalog']
        value = self.registry.capture()
        with self.service.mailbox.lock:
            self.service.mailbox.catalog = value
        self.publish(value)
        return value

    def on_event(self, mode, obj, args):
        if not self.enabled or self.busy:
            return None
        if get_ident() != self.thread:
            self.counts['wrong_thread'] += 1
            return None
        try:
            name = str(args.OwningWidgetDef._name).casefold()
            if name not in (OWN, NAV):
                self.counts['foreign'] += 1
                return None
            if str(obj.Class._path_name()) != SCRIPT_CLASS:
                self.counts['foreign'] += 1
                return None
            self.busy = True
            if name == OWN and mode == 'apply' and not self.service.mailbox.active:
                value = self.registry.capture()
                self.service.mailbox.open(value)
                self.counts['opens'] += 1
                self.publish(value)
            elif name == NAV and mode == 'release':
                request = self.service.mailbox.close()
                if request is None:
                    return None
                self.counts['native_closes'] += 1
                if request['commands']:
                    result = self.registry.apply(request['commands'])
                    self.counts['batches'] += 1
                    result.update(same_start_thread=True, thread=get_ident(), trigger='native_navigation_deactivate', execution_context='native ui_script_menu_base callback on guarded scene startup thread')
                    value = self.registry.capture()
                    self.service.mailbox.finish(request, result, value)
                    self.publish(value)
                    with self.service.lock:
                        self.service.report['transactions'] = self.service.mailbox.snapshot()
                        self.service.save_report()
                    self.sdk.logging.info(f'[ECHO Menu] APPLY v1.3.0 status={result["status"]} completed={len(result["completed"])} errors={len(result["errors"])} json={self.service.path}')
                else:
                    self.publish(self.service.mailbox.snapshot()['catalog'])
        except Exception as error:
            self.service.error(error)
            self.sdk.logging.error(f'[ECHO Menu] CALLBACK_FAILED v1.3.0 {type(error).__name__}: {error}')
        finally:
            self.busy = False
        return None


def start(entry_file=None):
    global _active
    import unrealsdk as sdk
    if _active is not None:
        if not _active.enabled:
            sdk.logging.error('[ECHO Menu] START_REJECTED v1.3.0 cleanup pending; rerun stop')
            return False
        _active.same_thread()
        sdk.logging.info('[ECHO Menu] ALREADY_ARMED v1.3.0')
        return True
    try:
        installation = require_tag_config(entry_file or __file__)
    except Exception as error:
        sdk.logging.error(f'[ECHO Menu] START_FAILED v1.3.0 {type(error).__name__}: {error}')
        return False
    scene = importlib.import_module('bl4_echo_mod_menu.scene.lifecycle')
    had_scene = scene._active is not None
    if not scene.start(entry_file):
        if not had_scene:
            scene.stop()
        return False
    session = None
    try:
        base = importlib.import_module('mods_base')
        service = server.MenuService()
        service.report['native_installation'] = installation
        session = Session(sdk, base, service)
        session.owns_scene = not had_scene
        session.refresh()
        definitions = hook_metadata(sdk)
        if {row['mode'] for row in definitions} != {'apply', 'release'} or len(definitions) != 2:
            raise RuntimeError('Both lifecycle signatures are required')
        service.report['hook_registrations'] = []
        for definition in definitions:
            path, mode = definition['path'], definition['mode']
            row = {'path': path, 'mode': mode, 'present_before': bool(sdk.hooks.has_hook(path, sdk.hooks.Type.POST, HOOK_ID))}
            service.report['hook_registrations'].append(row)
            if row['present_before']:
                raise RuntimeError('Owned hook identifier already exists; restart BL4')
            session.paths.append(path)  # Track attempt before SDK may insert then return False/raise.
            def callback(obj, args, ret, func, _mode=mode):
                return session.on_event(_mode, obj, args)
            row['add_returned'] = sdk.hooks.add_hook(path, sdk.hooks.Type.POST, HOOK_ID, callback)
            row['present_after'] = bool(sdk.hooks.has_hook(path, sdk.hooks.Type.POST, HOOK_ID))
            if not row['present_after']:
                raise RuntimeError('Lifecycle hook absent after registration')
        session.enabled = True
        service.report['scope'].update(sdk_hooks=2, worker_sdk_access=0,
            sdk_access='starting game thread; catalog on own Activate; writes only on native navigation Deactivate',
            partial_apply_policy='preflight all, stop at first callback failure, persist actual completed option changes')
        service.report['catalog_hook_active'] = True
        with service.lock:
            service.report['stage'] = 'armed'
            service.save_report()
        _active = session
        sdk.logging.info(f'[ECHO Menu] ARMED v1.3.0 format={distribution_info()["format"]} mods={len(service.catalog["mods"])} menu_hooks=2 scene_hooks=2 writes=on_menu_close json={service.path}')
        return True
    except Exception as error:
        if session is not None:
            session.service.error(error)
            _active = session
            stop()
        elif not had_scene:
            scene.stop()
        sdk.logging.error(f'[ECHO Menu] START_FAILED v1.3.0 {type(error).__name__}: {error}')
        return False


def stop():
    global _active
    import unrealsdk as sdk
    if _active is None:
        return True
    session = _active
    if get_ident() != session.thread:
        sdk.logging.error('[ECHO Menu] STOP_REJECTED wrong thread')
        return False
    session.enabled = False
    try:
        cancelled = session.service.mailbox.cancel()
        session.service.report['cancelled_on_stop'] = session.service.report.get('cancelled_on_stop', 0) + cancelled
        for path in list(reversed(session.paths)):
            if sdk.hooks.has_hook(path, sdk.hooks.Type.POST, HOOK_ID):
                sdk.hooks.remove_hook(path, sdk.hooks.Type.POST, HOOK_ID)
            if sdk.hooks.has_hook(path, sdk.hooks.Type.POST, HOOK_ID):
                raise RuntimeError('Hook cleanup pending; rerun stop')
            session.paths.remove(path)
        session.service.report['catalog_hook_active'] = False
        session.service.report['counts'] = dict(session.counts)
        session.service.stop()
        if session.owns_scene and not importlib.import_module('bl4_echo_mod_menu.scene.lifecycle').stop():
            raise RuntimeError('Scene cleanup pending; rerun stop')
        r = session.service.report
        last = session.service.mailbox.last_result or {}
        apply_status = last.get('status', 'none')
        apply_errors = len(last.get('errors', []))
        sdk.logging.info(f'[ECHO Menu] STOPPED v1.3.0 mods={len(session.service.catalog.get("mods", []))} batches={session.counts["batches"]} apply_status={apply_status} apply_errors={apply_errors} events={len(r["events"])} errors={len(r["errors"])} menu_hooks=0 json={session.service.path}')
        _active = None
        return True
    except Exception as error:
        sdk.logging.error(f'[ECHO Menu] STOP_FAILED v1.3.0 {type(error).__name__}: {error}')
        return False


def refresh():
    if _active is not None:
        return _active.refresh()
