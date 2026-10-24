"""Bounded, event-driven UI service. The HTTP worker never accesses the SDK."""
from __future__ import annotations
import json
import os
import socket
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Event, Lock, Thread
from .transactions import Mailbox, Rejected
from .config import BUILD_TOKEN, VERSION
from ..metadata import distribution_info
from ..paths import report_directory
from ..localization import valid_preference

SERVICE = 'echo-mod-menu-v1'
PREFIX = '/' + SERVICE
PORT = 19401
MAX_BODY = 262144
MAX_EVENTS = 800
_active = None

def write_report(path, value):
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2)+'\n', encoding='utf-8')
    os.replace(tmp, path)

def assessment(rows):
    """Summarize only events explicitly sent to this menu's local service."""
    return {'event_count':len(rows), 'error_events':sum('error' in row.get('kind','') for row in rows)}


class MenuService:
    def __init__(self, port=PORT, directory=None):
        self.lock = Lock()
        self.stopping = Event()
        self.catalog = {'mods': [], 'status': 'not_ready', 'errors': []}
        self.mailbox = Mailbox()
        self.preferences_path = None
        self.preferences = {'language': 'auto'}
        root = report_directory() if directory is None else Path(directory)
        root.mkdir(parents=True, exist_ok=True)
        self.preferences_path = root / 'preferences.json'
        try:
            prefs = json.loads(self.preferences_path.read_text(encoding='utf-8'))
            if valid_preference(prefs.get('language')):
                self.preferences['language'] = prefs['language']
        except (OSError, ValueError, AttributeError):
            pass
        now = datetime.now(timezone.utc)
        self.path = root/('menu_'+now.strftime('%Y%m%d_%H%M%S_%f')+'.json')
        self.report = {
            'component': 'ECHO Mod Menu', 'version': VERSION,
            'distribution': distribution_info(),
            'stage': 'listening', 'time_utc': now.isoformat(),
            'scope': {'sdk_hooks': 0, 'gameplay_setting_writes': 'validated SDK actions at native menu close',
                      'raw_memory_access': 0, 'worker_sdk_access': 0,
                      'timers': 0, 'periodic_requests': 0, 'client':'own ECHO editor only'},
            'events': [], 'errors': [], 'limits': [], 'assessment': assessment([]),
        }
        self.http = HTTPServer(('127.0.0.1', port), Handler)
        self.http.owner = self
        self.report['port'] = self.http.server_port
        try:
            self.save_report()
            self.thread = Thread(target=self.run, name='ECHO-Menu-Transport', daemon=True)
            self.thread.start()
        except Exception:
            self.http.server_close()
            raise

    def save_report(self):
        # Normal use persists only preferences. Enable bounded diagnostic output
        # before startup via ECHO_MOD_MENU_DIAGNOSTICS=1, or retain an error.
        from ..diagnostics import ENABLED
        if ENABLED or self.report['errors']:
            write_report(self.path, self.report)

    def error(self, error):
        with self.lock:
            if len(self.report['errors']) < 12:
                self.report['errors'].append(type(error).__name__+': '+str(error)[:300])

    def run(self):
        try:
            while not self.stopping.is_set():
                self.http.handle_request()  # Blocking on network input, no timer.
        except Exception as error:
            self.error(error)
        finally:
            self.http.server_close()

    def receive(self, body):
        if not isinstance(body,dict) or body.get('token') != BUILD_TOKEN:
            return 403, {'ok':False, 'service':SERVICE}
        event = body.get('event')
        if not isinstance(event,dict) or not isinstance(event.get('kind'),str) or len(event['kind'])>80:
            return 400, {'ok':False, 'service':SERVICE}
        if not isinstance(event.get('detail'),dict) or not isinstance(event.get('state'),dict):
            return 400, {'ok':False, 'service':SERVICE}
        # Normalize only plain bounded JSON, never deserialize objects or eval code.
        clean = json.loads(json.dumps(event,allow_nan=False))
        with self.lock:
            if len(self.report['events']) >= MAX_EVENTS:
                if 'event_limit' not in self.report['limits']:
                    self.report['limits'].append('event_limit')
                return 429, {'ok':False, 'service':SERVICE}
            self.report['events'].append(clean)
            self.report['assessment'] = assessment(self.report['events'])
            self.save_report()
        return 200, {'ok':True, 'service':SERVICE}

    def receive_catalog(self, body):
        if not isinstance(body, dict) or body.get('token') != BUILD_TOKEN:
            return 403, {'ok': False, 'service': SERVICE}
        value = self.mailbox.snapshot()
        with self.lock:
            value['preferences'] = dict(self.preferences)
        return 200, {'ok': True, 'service': SERVICE, **value}

    def receive_stage(self, body):
        if not isinstance(body, dict) or body.get('token') != BUILD_TOKEN:
            return 403, {'ok': False, 'service': SERVICE}
        try:
            value = self.mailbox.stage(body)
            return 200, {'ok': True, 'service': SERVICE, **value}
        except Rejected as error:
            return 409, {'ok': False, 'service': SERVICE, 'code': str(error)}

    def receive_preferences(self, body):
        if not isinstance(body, dict) or body.get('token') != BUILD_TOKEN:
            return 403, {'ok': False, 'service': SERVICE}
        if not valid_preference(body.get('language')):
            return 400, {'ok': False, 'service': SERVICE}
        with self.lock:
            self.preferences = {'language': body['language']}
            write_report(self.preferences_path, self.preferences)
        return 200, {'ok': True, 'service': SERVICE, 'preferences': dict(self.preferences)}

    def stop(self):
        self.stopping.set()
        if self.thread.is_alive():
            try:
                with socket.create_connection(('127.0.0.1',self.http.server_port),timeout=2) as wake:
                    wake.sendall(b'GET /wake HTTP/1.0\r\n\r\n')
            except OSError:
                pass
            self.thread.join(timeout=4)
        if self.thread.is_alive():
            raise RuntimeError('MenuService thread has not stopped; rerun to retry')
        with self.lock:
            self.report['stage'] = 'partial' if self.report['errors'] or self.report['limits'] else 'stopped'
            self.report['assessment'] = assessment(self.report['events'])
            self.report['transactions'] = self.mailbox.snapshot()
            self.report['preferences'] = dict(self.preferences)
            self.save_report()

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(2)  # Failed-client transport guard only.

    def log_message(self, *args):
        pass

    def reply(self, status, value):
        payload = json.dumps(value,allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Cache-Control','no-store')
        self.send_header('Connection','close')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.server.owner.stopping.is_set():
            return
        try:
            self.reply(404,{'ok':False,'service':SERVICE})
        except (OSError,TimeoutError):
            pass

    def do_POST(self):
        try:
            if self.server.owner.stopping.is_set():
                return self.reply(503,{'ok':False,'service':SERVICE})
            if self.path not in {PREFIX+'/event', PREFIX+'/catalog', PREFIX+'/stage', PREFIX+'/preferences'}:
                return self.reply(404,{'ok':False,'service':SERVICE})
            if self.headers.get('Transfer-Encoding') is not None:
                return self.reply(400,{'ok':False,'service':SERVICE})
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= MAX_BODY:
                return self.reply(413,{'ok':False,'service':SERVICE})
            raw = self.rfile.read(length)
            if len(raw) != length:
                return self.reply(400,{'ok':False,'service':SERVICE})
            value = json.loads(raw,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
            handlers = {'/catalog': self.server.owner.receive_catalog, '/event': self.server.owner.receive,
                        '/stage': self.server.owner.receive_stage, '/preferences': self.server.owner.receive_preferences}
            status, result = handlers[self.path[len(PREFIX):]](value)
            self.reply(status,result)
        except (ValueError,UnicodeError,RecursionError):
            self.reply(400,{'ok':False,'service':SERVICE})
        except (OSError,TimeoutError):
            pass
        except Exception as error:
            self.server.owner.error(error)
