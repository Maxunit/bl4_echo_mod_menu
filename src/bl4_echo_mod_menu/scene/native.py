"""One guarded Win64 scene-handler call with Python-owned native arguments."""
import ctypes
from .pe import image_info
from ..resources import read_json


class Name(ctypes.Structure):
    _fields_ = [('index', ctypes.c_uint32), ('number', ctypes.c_uint32)]


class EmptyArray(ctypes.Structure):
    _fields_ = [('data', ctypes.c_void_p), ('num', ctypes.c_int32), ('capacity', ctypes.c_int32)]


def validate_image(memory, config):
    info = image_info(memory)
    if any(info[key] != config[key] for key in ('canonical_header_sha256', 'image_size', 'pe_timestamp')):
        raise RuntimeError('Build fingerprint differs; no native call')
    memory.set_image_size(info['image_size'])
    regions = memory.regions(info['image_size'])
    def executable(rva, size):
        cursor, end = rva, rva + size
        for row in regions:
            if row['rva'] <= cursor < row['rva'] + row['size']:
                if not row['readable'] or not row['executable']: return False
                cursor = min(end, row['rva'] + row['size'])
                if cursor == end: return True
        return False
    for guard in config['guards']:
        raw = bytes.fromhex(guard['hex'])
        rva = guard['rva']
        if not executable(rva, len(raw)) or memory.read(memory.base + rva, len(raw)) != raw:
            raise RuntimeError('Native code bytes differ; no native call')
    if not executable(config['handler_rva'], 1):
        raise RuntimeError('Handler is not readable executable code')
    return info


def name_value(sdk, memory, text):
    # SDK creates and owns this temporary struct. Obtain the actual FName offset.
    value = sdk.make_struct('/Script/GameplayTags.GameplayTag', TagName=text)
    prop = value._type._find_prop('TagName')
    if type(prop).__name__ != 'ZNameProperty':
        raise RuntimeError('Unexpected GameplayTag name property type')
    offset, size = int(prop.Offset_Internal), int(prop.ElementSize)
    if size != 8 or int(prop.ArrayDim) != 1:
        raise RuntimeError('Unexpected GameplayTag name layout')
    if not 0 <= offset <= int(value._type.PropertySize) - size:
        raise RuntimeError('Invalid GameplayTag name offset')
    if str(value.TagName).casefold() != text.casefold():
        raise RuntimeError('Name round trip differs')
    raw = memory.read_owned(int(value._get_address()) + offset, 8)
    if not int.from_bytes(raw, 'little'):
        raise RuntimeError('Required name resolved to None')
    return Name.from_buffer_copy(raw)


def prepare(memory, sdk, mode, config=None):
    if mode not in ('apply', 'release'): raise ValueError('Unknown mode')
    if config is None:
        config = read_json(__package__, 'config.json')
    info = validate_image(memory, config)
    owner_class = sdk.find_class(config['owner_class'])
    local_class = sdk.find_class('/Script/Engine.LocalPlayer')
    if owner_class is None or local_class is None:
        raise RuntimeError('Required loaded classes unavailable')
    cached_class = int.from_bytes(memory.read(memory.base + config['owner_class_cache_rva'], 8), 'little')
    if cached_class != int(owner_class._get_address()):
        raise RuntimeError('SDK class differs from captured native owner class')
    controllers = []
    for index, controller in enumerate(sdk.find_all(owner_class, exact=False)):
        if index >= 32: raise RuntimeError('Controller candidate limit reached')
        if controller is None or str(controller.Name).startswith('Default__'): continue
        player = controller.Player
        if player is not None and player.Class is not None and player.Class._inherits(local_class):
            controllers.append(controller)
    if len(controllers) != 1:
        raise RuntimeError(f'Expected one local controller, found {len(controllers)}')
    controller = controllers[0]
    if not controller.Class._inherits(owner_class):
        raise RuntimeError('Controller type differs')
    prop = owner_class._find_prop('UIStatusMenuManager')
    if (type(prop).__name__ != 'ZStructProperty' or int(prop.Offset_Internal) != config['manager_offset']
            or int(prop.ElementSize) != 96 or int(prop.ArrayDim) != 1):
        raise RuntimeError('Current reflected status manager layout differs')
    owner_prop = prop.Struct._find_prop('owner')
    if (str(prop.Struct._path_name()) != '/Script/OakGame.OakUIStatusMenuManager'
            or type(owner_prop).__name__ != 'ZObjectProperty'
            or int(owner_prop.Offset_Internal) != config['manager_owner_offset']
            or int(owner_prop.ElementSize) != 8 or int(owner_prop.ArrayDim) != 1):
        raise RuntimeError('Current reflected manager owner layout differs')
    required_size = config['manager_offset'] + 96
    if int(owner_class._get_struct_size()) < required_size:
        raise RuntimeError('Owner type is smaller than the captured manager offset')
    address = int(controller._get_address())
    manager = address + config['manager_offset']
    manager_owner = int.from_bytes(memory.read_owned(manager + config['manager_owner_offset'], 8), 'little')
    if manager_owner != address:
        raise RuntimeError('Embedded scene-manager owner differs; no native call')
    update = memory.read(memory.base + config['update_key_rva'], 8)
    branch = memory.read(memory.base + config['update_branch_rva'], 8)
    release = memory.read(memory.base + config['release_key_rva'], 8)
    if not int.from_bytes(update, 'little') or update != branch or release == update or not int.from_bytes(release, 'little'):
        raise RuntimeError('Captured action-key relationship differs')
    action = Name.from_buffer_copy(update if mode == 'apply' else release)
    widget = name_value(sdk, memory, config['owner_widget'])
    scene = name_value(sdk, memory, config['blank_scene']) if mode == 'apply' else Name()
    extras = EmptyArray()
    report = {'mode': mode, 'controller': str(controller), 'controller_address': hex(address),
        'manager_address': hex(manager), 'owner_class': str(owner_class),
        'manager_owner_matches': True, 'action_name_value': bytes(action).hex(),
        'widget_name': config['owner_widget'], 'widget_name_value': bytes(widget).hex(),
        'scene_name': config['blank_scene'] if mode == 'apply' else 'None',
        'scene_name_value': bytes(scene).hex(), 'image': info}
    # All references are local to this console invocation; nothing is retained.
    return report, (controller, manager, memory.base + config['handler_rva'], action, widget, scene, extras)


def invoke(arguments):
    controller, manager, function_address, action, widget, scene, extras = arguments
    signature = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.POINTER(Name),
        ctypes.POINTER(Name), ctypes.POINTER(Name), ctypes.POINTER(EmptyArray))
    function = signature(function_address)
    function(manager, ctypes.byref(action), ctypes.byref(widget), ctypes.byref(scene), ctypes.byref(extras))
