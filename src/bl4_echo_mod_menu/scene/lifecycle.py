"""Native blank-scene request lifecycle for the ECHO tab.

No quota, timers or workers. Normal tab switches update bounded memory only;
reports are written at explicit boundaries and errors.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from threading import get_ident
from time import perf_counter_ns
from .hooks import hook_metadata
from .memory import CurrentImage
from .native import prepare, invoke
from ..paths import locate_game_root, report_directory
from ..resources import read_json
from .queue_native import validate, context, enqueue, remove

OWN_WIDGET = 'def_bl4_empty_page_v40'
HOOK_ID = 'ECHO.ModMenu.Scene'
RECENT_EVENTS = 24
_active = None


class Session:
    def __init__(self, sdk, memory, path, emit):
        self.sdk, self.memory, self.path, self.emit = sdk, memory, Path(path), emit
        self.thread_id = get_ident()
        self.started = perf_counter_ns()
        self.enabled = self.busy = self.own_visible = False
        self.token = None
        self.installed = []
        self.expected = {}
        self.last_logged_error = None
        self.config = read_json(__package__, 'config.json')
        self.report = {'component':'ECHO Scene', 'version':'1.2.2',
            'time_utc':datetime.now(timezone.utc).isoformat(), 'stage':'preparing',
            'scope':{'target_widget':OWN_WIDGET, 'sdk_hooks_max':2,
                'request_quota':None, 'requests_per_activation':1,
                'normal_switch_report_writes':0, 'normal_switch_log_lines':0,
                'recent_event_bound':RECENT_EVENTS, 'timers':0, 'polling':0,
                'worker_sdk_access':0, 'native_code_patches':0,
                'persistent_uobject_wrappers':0, 'python_callbacks_in_native_queue':0,
                'native_core':'Reviewed Steam 1.11 executable; guarded request ownership',
                'fresh_request_allocation_zeroed_before_constructor':True,
                                'start_policy':'Inventory lifecycle activation; native preflight mandatory',
                'report_write_policy':'Explicit start, check, stop or error only'},
            'counts':{'callbacks':0, 'foreign':0, 'queue_attempts':0, 'queued':0,
                'cancel_returned':0, 'expired_dispatcher':0, 'release_returned':0,
                'checks':0, 'duplicates':0, 'reentrant':0, 'omitted_events':0},
            'events':[], 'errors':[]}

    def same_thread(self):
        if get_ident() != self.thread_id:
            raise RuntimeError('Operation differs from starting game thread; no SDK/native access')

    def save(self):
        """Explicit boundaries/errors only; never normal tab changes."""
        self.report['hooks'] = list(self.installed)
        self.report['own_lifecycle_active'] = self.own_visible
        self.report['copied_token'] = self.token
        from ..diagnostics import ENABLED
        if not ENABLED and not self.report['errors']:
            return
        temporary = self.path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(self.report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        os.replace(temporary, self.path)

    def event(self, kind, **details):
        row = {'kind':kind, 'elapsed_ms':(perf_counter_ns()-self.started)/1_000_000, **details}
        if len(self.report['events']) >= RECENT_EVENTS:
            del self.report['events'][0]
            self.report['counts']['omitted_events'] += 1
        self.report['events'].append(row)
        return row

    def trace(self, kind, **details):
        """Retain bounded request-lifetime diagnostics in memory."""
        if kind == 'constructed_request_validation':
            self.report['last_request_validation'] = details
        self.event(kind, **details)


    def start(self):
        self.same_thread()
        details, arguments = prepare(self.memory, self.sdk, 'apply', self.config)
        validate(self.memory, self.config)
        self.report['preflight'] = details
        self.expected = {key:details[key] for key in ('widget_name_value','scene_name_value')}
        self.report['preflight_context'] = context(self.memory, self.sdk, arguments[0])
        self.report['hook_resolution'] = {}
        definitions = hook_metadata(self.sdk, self.report['hook_resolution'])
        try:
            for definition in definitions:
                path, mode = definition['path'], definition['mode']
                def callback(obj, args, ret, func, _mode=mode):
                    return self.on_event(_mode, args)
                if self.sdk.hooks.has_hook(path, self.sdk.hooks.Type.POST, HOOK_ID):
                    raise RuntimeError('Hook already exists: '+path)
                self.installed.append(path)
                self.sdk.hooks.add_hook(path, self.sdk.hooks.Type.POST, HOOK_ID, callback)
                if not self.sdk.hooks.has_hook(path, self.sdk.hooks.Type.POST, HOOK_ID):
                    raise RuntimeError('Scene hook absent after registration: '+path)
            self.enabled = True
            self.report['stage'] = 'armed'
            self.save()
        except Exception:
            self.enabled = False
            self.remove_hooks()
            raise

    def remove_hooks(self):
        self.same_thread()
        for path in list(reversed(self.installed)):
            self.sdk.hooks.remove_hook(path, self.sdk.hooks.Type.POST, HOOK_ID)
            if self.sdk.hooks.has_hook(path, self.sdk.hooks.Type.POST, HOOK_ID):
                raise RuntimeError('Hook removal failed: '+path)
            self.installed.remove(path)

    def retain(self, token):
        if self.token is not None: raise RuntimeError('Unresolved previous request token')
        self.token = dict(token)

    def apply(self):
        if self.token is not None: raise RuntimeError('Previous request must be cleaned before another submit')
        details, arguments = prepare(self.memory, self.sdk, 'apply', self.config)
        ctx = context(self.memory, self.sdk, arguments[0])
        self.trace('queue_prepare', controller_address=details['controller_address'], context=ctx)
        self.report['counts']['queue_attempts'] += 1
        enqueue(self.memory, self.sdk, self.config, arguments, ctx, self.retain, self.trace)
        self.report['counts']['queued'] += 1
        self.event('submit_returned')

    def cleanup(self, reason):
        self.same_thread()
        if self.token is None: return
        token = dict(self.token)
        self.trace('cancel_enter', reason=reason, copied_handle=token['handle'])
        result = remove(self.memory, self.sdk, self.config, token)
        self.event('cancel_returned', reason=reason, result=result)
        if result['status'] == 'dispatcher_identity_expired':
            self.report['counts']['expired_dispatcher'] += 1
        else:
            self.report['counts']['cancel_returned'] += 1
        cls = self.sdk.find_class(self.config['owner_class'])
        matches = []
        if cls is not None:
            for index, obj in enumerate(self.sdk.find_all(cls, exact=False)):
                if index >= 32: raise RuntimeError('Cleanup controller bound')
                if obj is not None and hex(int(obj._get_address())) == token['controller_address']:
                    matches.append(obj)
        if not matches:
            self.event('release_skipped_missing_controller', reason=reason)
            self.token = None
            return
        details, arguments = prepare(self.memory, self.sdk, 'release', self.config)
        if details['controller_address'] == token['controller_address']:
            self.trace('release_enter', reason=reason)
            invoke(arguments)
            self.report['counts']['release_returned'] += 1
            self.event('release_returned', reason=reason)
        else:
            self.event('release_skipped_changed_controller', reason=reason)
        self.token = None

    def fail(self, error):
        self.enabled = False
        message = type(error).__name__+': '+str(error)[:400]
        if message not in self.report['errors'] and len(self.report['errors']) < 16:
            self.report['errors'].append(message)
        self.report['stage'] = 'failed'
        try: self.save()
        except OSError as write_error: message += '; report write: '+str(write_error)[:120]
        if message != self.last_logged_error:
            self.emit(f'[ECHO Scene] FAILED v1.2.2 {message} json={self.path}')
            self.last_logged_error = message

    def on_event(self, mode, args):
        # After failure only own deactivation may clean up; never inspect SDK
        # wrappers on another thread, including during cleanup.
        if not self.enabled and (self.token is None or mode != 'release'): return None
        if not self.enabled and get_ident() != self.thread_id: return None
        self.report['counts']['callbacks'] += 1
        if self.busy:
            self.report['counts']['reentrant'] += 1
            return None
        try:
            self.same_thread()
            ident = str(args.OwningWidgetDef._name)
            if ident.casefold() != OWN_WIDGET.casefold():
                self.report['counts']['foreign'] += 1
                return None
            self.event('own_lifecycle', mode=mode)
            self.busy = True
            if mode == 'apply':
                if self.own_visible:
                    self.report['counts']['duplicates'] += 1
                else:
                    self.own_visible = True
                    self.apply()
            else:
                self.own_visible = False
                self.cleanup('widget_release')
        except Exception as error:
            self.fail(error)
        finally:
            self.busy = False
        return None


    def stop(self):
        self.same_thread()
        self.enabled = False
        self.cleanup('manual_stop')
        self.remove_hooks()
        self.own_visible = False
        self.report['stage'] = 'stopped' if not self.report['errors'] else 'stopped_with_errors'
        self.save()


def start(entry_file=None):
    """Explicit idempotent start, also available for later mod integration."""
    global _active
    import unrealsdk as sdk
    emit = sdk.logging.info
    if _active is not None:
        if _active.enabled: return True
        emit('[ECHO Scene] START_REJECTED v1.2.2 previous session requires stop/cleanup')
        return False
    session = None
    try:
        root = locate_game_root(entry_file)
        directory = report_directory()
        directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
        session = Session(sdk, CurrentImage(root), directory/('scene_'+stamp+'.json'), emit)
        session.start()
        _active = session
        emit(f'[ECHO Scene] ARMED v1.2.2 hooks=2 quota=none quiet=True json={session.path}')
        return True
    except Exception as error:
        if session is not None:
            session.fail(error)
            if session.installed or session.token is not None: _active = session
        else: emit('[ECHO Scene] START_FAILED v1.2.2 '+type(error).__name__+': '+str(error)[:400])
        return False


def stop():
    """Idempotent stop; preserve failed cleanup state for an explicit retry."""
    global _active
    import unrealsdk as sdk
    if _active is None: return True
    try:
        _active.stop()
        c = _active.report['counts']
        sdk.logging.info(f'[ECHO Scene] STOPPED v1.2.2 queued={c["queued"]} cancel={c["cancel_returned"]} release={c["release_returned"]} errors={len(_active.report["errors"])} hooks={len(_active.installed)} json={_active.path}')
        _active = None
        return True
    except Exception as error:
        _active.fail(error)
        return False
