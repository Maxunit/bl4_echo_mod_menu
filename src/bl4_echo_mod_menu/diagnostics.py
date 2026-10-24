"""Diagnostic file output is opt-in; ordinary settings persistence is separate."""
import os
ENABLED = os.environ.get('ECHO_MOD_MENU_DIAGNOSTICS', '') == '1'
