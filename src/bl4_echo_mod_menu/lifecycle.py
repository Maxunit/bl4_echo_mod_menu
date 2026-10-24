"""One-shot automatic startup on the observed native inventory Activate event.

Import/enable only installs an SDK hook. Scene preparation and catalog access
run from the menu callback on its game thread, never the Python loader/HTTP worker.
"""
from threading import get_ident
from .menu import controller
from .metadata import distribution_info

BOOT_CLASS = '/Script/GbxUICoherent.GbxUIScript'
BOOT_PATH = BOOT_CLASS + ':Activate'
HOOK_ID = 'ECHO.ModMenu.Bootstrap'
_enabled = False
_installed = False
_busy = False
_failed = False
_game_thread = None


def validate_bootstrap(sdk):
    cls = sdk.find_class(BOOT_CLASS)
    if cls is None or str(cls._path_name()) != BOOT_CLASS:
        raise RuntimeError('Native UI script class unavailable')
    matches = []
    for index, field in enumerate(cls._fields()):
        if index >= 512:
            raise RuntimeError('Native UI field limit')
        if type(field).__name__ == 'UFunction' and str(field._path_name()) == BOOT_PATH:
            matches.append(field)
    if len(matches) != 1:
        raise RuntimeError('Observed native Activate function unavailable/ambiguous')
    field = matches[0]
    props = {}
    for index, prop in enumerate(field._properties()):
        if index >= 32:
            raise RuntimeError('Native UI parameter limit')
        if int(prop.PropertyFlags) & 0x80:
            props[str(prop.Name)] = type(prop).__name__
    if int(field.NumParams) != 2 or props != {
            'WorldContextObject':'ZObjectProperty', 'OwningWidgetDef':'ZGbxDefPtrProperty'}:
        raise RuntimeError('Observed native Activate signature differs')


def remove_bootstrap(sdk):
    global _installed
    if not _installed:
        return
    if sdk.hooks.has_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID):
        sdk.hooks.remove_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID)
    if sdk.hooks.has_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID):
        raise RuntimeError('Autostart hook cleanup pending')
    _installed = False


def on_activate(obj, args, ret=None, func=None):
    global _busy, _failed, _game_thread
    if not _enabled or _busy or _failed:
        return None
    import unrealsdk as sdk
    try:
        if str(args.OwningWidgetDef._name).casefold() != controller.NAV:
            return None
        if str(obj.Class._path_name()) != controller.SCRIPT_CLASS:
            return None
        _game_thread = get_ident()
        _busy = True
        # Remove our bootstrap before installing the two persistent hooks on
        # this path. This also avoids SDK 3.2's second-add return-value quirk.
        remove_bootstrap(sdk)
        if not controller.start(__file__):
            raise RuntimeError('Guarded menu startup failed; see preceding report')
        sdk.logging.info('[ECHO Menu] STARTED v1.1.0 trigger=inventory_activate')
    except Exception as error:
        _failed = True
        sdk.logging.error('[ECHO Menu] FAILED v1.1.0 ' + type(error).__name__ + ': ' + str(error)[:350])
    finally:
        _busy = False
    return None


def enable():
    global _enabled, _installed, _failed
    import unrealsdk as sdk
    if _enabled and (_installed or controller._active is not None):
        return True
    if _busy:
        return False
    _failed = False
    try:
        validate_bootstrap(sdk)
        if sdk.hooks.has_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID):
            raise RuntimeError('Autostart hook identifier already owned')
        _installed = True  # Own the attempt even if SDK inserts then raises.
        sdk.hooks.add_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID, on_activate)
        if not sdk.hooks.has_hook(BOOT_PATH, sdk.hooks.Type.POST, HOOK_ID):
            raise RuntimeError('Autostart hook absent after registration')
        _enabled = True
        sdk.logging.info('[ECHO Menu] WAITING v1.1.0 trigger=inventory_activate format=' + distribution_info()['format'])
        return True
    except Exception as error:
        _enabled = False
        _failed = True
        try:
            remove_bootstrap(sdk)
        except Exception as cleanup:
            sdk.logging.error('[ECHO Menu] CLEANUP_PENDING ' + str(cleanup)[:200])
        sdk.logging.error('[ECHO Menu] ARM_FAILED v1.1.0 ' + str(error)[:350])
        return False


def stop():
    global _enabled
    import unrealsdk as sdk
    if _busy or _game_thread is not None and get_ident() != _game_thread:
        sdk.logging.error('[ECHO Menu] STOP_REJECTED busy or wrong game thread')
        return False
    _enabled = False
    try:
        remove_bootstrap(sdk)
        return controller.stop()
    except Exception as error:
        sdk.logging.error('[ECHO Menu] STOP_FAILED ' + str(error)[:350])
        return False
