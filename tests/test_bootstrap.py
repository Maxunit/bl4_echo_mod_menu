"""Load pure submodules for fixtures without running the real SDK entry point.

The full entry point is exercised separately in an isolated archive-only process.
Set ECHO_TEST_SDKMOD to exercise these same regressions through zipimport.
"""
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"tools"))


def prepare_package():
    if 'bl4_echo_mod_menu' in sys.modules:
        return
    location = os.environ.get('ECHO_TEST_SDKMOD')
    search = str(Path(location).resolve()) if location else str(Path(__file__).resolve().parent.parent/'src')
    spec = importlib.machinery.PathFinder.find_spec('bl4_echo_mod_menu', [search])
    if spec is None:
        raise RuntimeError('Cannot locate the ECHO package for testing: ' + search)
    package = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = package
