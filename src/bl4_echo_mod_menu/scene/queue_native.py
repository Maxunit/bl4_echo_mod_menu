"""Native-owned request, native callback and copied cancellation handle.

Never read or free a request after ownership passes to the dispatcher.
No Python function address or Python allocation escapes into the queue.
"""
import ctypes
import struct
from .native import Name, EmptyArray, validate_image
from ..resources import read_json

VIEW = '/Script/GbxUICoherent.GbxUIView'
MANAGER = '/Script/GbxUICoherent.GbxUIViewManager'
DISPATCHER = '/Script/GbxUICore.GbxUIEventDispatcher'
MAX_OBJECTS = 1_000_000
_PROFILE = read_json(__package__, 'config.json')
OBJECT_COUNT_RVA = _PROFILE['object_count_rva']
OBJECT_CHUNKS_RVA = _PROFILE['object_chunks_rva']
REQUEST_VTABLE_RVA = _PROFILE['tables'][0]['rva']


class WeakExpired(RuntimeError):
    pass


def stable(memory, address, size):
    raw = memory.read_owned(address, size)
    if raw != memory.read_owned(address, size):
        raise RuntimeError('Native context changed during validation')
    return raw


def weak_resolve(memory, raw):
    index, serial = struct.unpack('<iI', raw)
    count = int.from_bytes(memory.read(memory.base + OBJECT_COUNT_RVA, 4), 'little')
    if not 0 < count <= MAX_OBJECTS:
        raise RuntimeError('Live table count outside validation bound')
    if serial == 0 or not 0 <= index < count:
        raise WeakExpired('Weak identity is null or outside live table')
    chunks = int.from_bytes(memory.read(memory.base + OBJECT_CHUNKS_RVA, 8), 'little')
    chunk = int.from_bytes(stable(memory, chunks + (index >> 16)*8, 8), 'little')
    item = stable(memory, chunk + (index & 65535)*24, 24)
    pointer, flags = struct.unpack_from('<QI', item)
    if not pointer or flags & 0x10200000 or struct.unpack_from('<I', item, 16)[0] != serial:
        raise WeakExpired('Weak identity expired or object is being destroyed')
    return pointer


def find_weak(memory, address):
    """Once per request; bounded read-only search for an SDK-resolved address."""
    count = int.from_bytes(memory.read(memory.base + OBJECT_COUNT_RVA, 4), 'little')
    if not 0 < count <= MAX_OBJECTS:
        raise RuntimeError('Live object table exceeds search bound')
    chunks = int.from_bytes(memory.read(memory.base + OBJECT_CHUNKS_RVA, 8), 'little')
    for first in range(0, count, 65536):
        chunk = int.from_bytes(stable(memory, chunks + (first >> 16)*8, 8), 'little')
        if not chunk: raise RuntimeError('Null object chunk')
        length = min(65536, count-first)
        for offset in range(0, length, 128):
            raw = memory.read_owned(chunk+offset*24, min(128, length-offset)*24)
            for item in range(len(raw)//24):
                if struct.unpack_from('<Q', raw, item*24)[0] != address: continue
                serial = struct.unpack_from('<I', raw, item*24+16)[0]
                result = struct.pack('<iI', first+offset+item, serial)
                if weak_resolve(memory, result) != address:
                    raise RuntimeError('SDK object identity changed during search')
                return result
    raise RuntimeError('SDK view not found in bounded object table')


def instances(sdk, path):
    cls = sdk.find_class(path)
    if cls is None: raise RuntimeError('Required loaded class unavailable: '+path)
    result = []
    for index, obj in enumerate(sdk.find_all(cls, exact=False)):
        if index >= 64: raise RuntimeError('SDK instance bound: '+path)
        if obj is None or str(obj.Name).startswith('Default__'): continue
        if not obj.Class._inherits(cls): raise RuntimeError('SDK class mismatch')
        result.append(obj)
    return cls, result


def sdk_match(memory, objects, address, min_size):
    matches = [obj for obj in objects if int(obj._get_address()) == address]
    if len(matches) != 1: raise RuntimeError('Native identity not matched to one existing SDK object')
    obj = matches[0]
    if int(obj.Class._get_struct_size()) < min_size or int.from_bytes(stable(memory, address+0x10, 8), 'little') != int(obj.Class._get_address()):
        raise RuntimeError('SDK native class or size mismatch')
    return obj


def context(memory, sdk, controller):
    view_cls, views = instances(sdk, VIEW)
    _, managers = instances(sdk, MANAGER)
    _, dispatchers = instances(sdk, DISPATCHER)
    prop = view_cls._find_prop('Handle')
    if int(prop.Offset_Internal) != 0x3C0 or int(prop.ElementSize) != 16 or int(prop.ArrayDim) != 1:
        raise RuntimeError('Reflected UIView Handle layout differs')
    player = int(controller.Player._get_address())
    candidates = []
    for view in views:
        address = int(view._get_address())
        sdk_match(memory, views, address, 0x3D0)
        handle = stable(memory, address+0x3C0, 16)
        if struct.unpack_from('<I', handle)[0] != 1 or int.from_bytes(handle[8:], 'little') != player:
            continue
        manager_weak = stable(memory, address+0x384, 8)
        manager = weak_resolve(memory, manager_weak)
        sdk_match(memory, managers, manager, 0x40)
        dispatcher_weak = stable(memory, manager+0x38, 8)
        dispatcher = weak_resolve(memory, dispatcher_weak)
        sdk_match(memory, dispatchers, dispatcher, 0x90)
        candidates.append((view, address, handle, manager_weak, manager, dispatcher_weak, dispatcher))
    if not candidates or len({row[6] for row in candidates}) != 1:
        raise RuntimeError('No unambiguous local-player view/dispatcher chain')
    view, address, handle, manager_weak, manager, dispatcher_weak, dispatcher = candidates[0]
    view_weak = find_weak(memory, address)
    if (stable(memory, address+0x3C0, 16) != handle or
        stable(memory, address+0x384, 8) != manager_weak or
        stable(memory, manager+0x38, 8) != dispatcher_weak or
        weak_resolve(memory, dispatcher_weak) != dispatcher):
        raise RuntimeError('Context changed before native call')
    return {'view': str(view._path_name()), 'view_address': hex(address),
        'view_weak': view_weak.hex(), 'manager_weak': manager_weak.hex(),
        'manager_address': hex(manager), 'handle_hex': handle.hex(),
        'dispatcher_weak': dispatcher_weak.hex(),
        'dispatcher_address': hex(dispatcher), 'local_player_address': hex(player),
        'matching_views': len(candidates)}


def validate(memory, config):
    info = validate_image(memory, config)
    regions = memory.regions(info['image_size'])
    for name, rva in config['entry_points'].items():
        if not any(row['rva'] <= rva < row['rva']+row['size'] and row['executable'] and row['readable'] for row in regions):
            raise RuntimeError('Native entry is not executable: '+name)
    for table in config['tables']:
        actual = struct.unpack('<'+'Q'*len(table['targets']), memory.read(memory.base+table['rva'], 8*len(table['targets'])))
        if list(actual) != [memory.base+rva for rva in table['targets']]:
            raise RuntimeError('Native request/callback ownership table differs')
    return info


def bind(memory, config, name, restype, *argtypes):
    return ctypes.CFUNCTYPE(restype, *argtypes)(memory.base+config['entry_points'][name])


def request_fields(raw, pointer, returned, base, action, widget, scene, player):
    """Check semantic fields individually; padding is recorded, never required."""
    if len(raw) != 0x68: raise ValueError('Native request snapshot length differs')
    def number(offset, size): return int.from_bytes(raw[offset:offset+size], 'little')
    rows = []
    def check(name, offset, actual, expected):
        rows.append({'name':name, 'offset':offset, 'actual':actual,
            'expected':expected, 'matches':actual==expected})
    check('constructor_return', None, hex(returned), hex(pointer))
    check('vtable', 0, hex(number(0,8)), hex(base+REQUEST_VTABLE_RVA))
    check('requester', 0x08, hex(number(8,8)), '0x0')
    check('callback_handle_nonzero', 0x20, number(0x20,8) != 0, True)
    check('context_kind', 0x28, number(0x28,4), 1)
    check('local_player', 0x30, hex(number(0x30,8)), hex(player))
    check('action_name', 0x38, raw[0x38:0x40].hex(), bytes(action).hex())
    check('owner_name', 0x40, raw[0x40:0x48].hex(), bytes(widget).hex())
    check('scene_name', 0x48, raw[0x48:0x50].hex(), bytes(scene).hex())
    check('extras_data', 0x50, hex(number(0x50,8)), '0x0')
    check('extras_num', 0x58, number(0x58,4), 0)
    check('extras_capacity', 0x5C, number(0x5C,4), 0)
    check('extras_constructed', 0x60, number(0x60,1), 1)
    return {'fields':rows, 'mismatched_fields':[row['name'] for row in rows if not row['matches']]}


def remove(memory, sdk, config, token):
    validate(memory, config)
    raw = bytes.fromhex(token['dispatcher_weak'])
    try:
        address = weak_resolve(memory, raw)
    except WeakExpired:
        # An expired UObject identity cannot have a live dispatcher callback map.
        # Distinguish stale identity from read failures; never use the old pointer.
        return {'status': 'dispatcher_identity_expired', 'native_calls': 0}
    _, objects = instances(sdk, DISPATCHER)
    sdk_match(memory, objects, address, 0x90)
    if address != int(token['dispatcher_address'], 16):
        raise RuntimeError('Cancellation dispatcher identity differs')
    handle = ctypes.c_uint64(token['handle'])
    function = bind(memory, config, 'remove', None, ctypes.c_void_p, ctypes.c_uint64, ctypes.POINTER(ctypes.c_uint64))
    function(address, token['action'], ctypes.byref(handle))
    if handle.value: raise RuntimeError('Native cancellation did not clear copied handle')
    return {'status': 'callback_remove_returned', 'native_calls': 1,
        'meaning': 'Matching callback removed if still registered; does not prove execution or dequeue.'}


def enqueue(memory, sdk, config, arguments, ctx, retain, trace):
    """retain(token) must run before submit; post-submit pointer is never read."""
    validate(memory, config)
    controller, _, _, action, widget, scene, extras = arguments
    view_weak = bytes.fromhex(ctx['view_weak'])
    if weak_resolve(memory, view_weak) != int(ctx['view_address'], 16):
        raise RuntimeError('View identity changed before construction')
    dispatcher = weak_resolve(memory, bytes.fromhex(ctx['dispatcher_weak']))
    if dispatcher != int(ctx['dispatcher_address'], 16):
        raise RuntimeError('Dispatcher identity changed before construction')
    view_address, manager_address = int(ctx['view_address'], 16), int(ctx['manager_address'], 16)
    if (stable(memory, view_address+0x3C0, 16).hex() != ctx['handle_hex'] or
        stable(memory, view_address+0x384, 8).hex() != ctx['manager_weak'] or
        weak_resolve(memory, bytes.fromhex(ctx['manager_weak'])) != manager_address or
        stable(memory, manager_address+0x38, 8).hex() != ctx['dispatcher_weak']):
        raise RuntimeError('View-manager-dispatcher context changed before allocation')
    allocate = bind(memory, config, 'allocate', ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32)
    construct = bind(memory, config, 'construct', ctypes.c_void_p, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_uint64), ctypes.POINTER(Name), ctypes.POINTER(Name), ctypes.POINTER(EmptyArray))
    destroy = bind(memory, config, 'destroy', ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32)
    free = bind(memory, config, 'free', None, ctypes.c_void_p)
    submit = bind(memory, config, 'submit', None, ctypes.c_void_p, ctypes.c_void_p)
    weak = ctypes.c_uint64(int.from_bytes(view_weak, 'little'))
    # Persist intent before allocating. There is no report I/O between native
    # allocation and construction, so a disk error cannot strand that block.
    trace('native_allocate_zero_and_constructor_enter', fresh_allocation_size=0x68,
        allocation_initialization='zero once before native construction')
    pointer = int(allocate(0x68, 0x10) or 0)
    if not pointer: raise RuntimeError('Native allocator returned null')
    try:
        memory.initialize_request_allocation(pointer)
    except Exception:
        # No constructor has run, so there is no callback and no destructor to
        # call. Return only this fresh allocation through the engine allocator.
        free(pointer)
        raise
    # OOM and native access faults are not recoverable Python control flow.
    # Constructor owns initialization; no hand-written native object fields.
    returned = int(construct(pointer, ctypes.byref(weak), ctypes.byref(widget), ctypes.byref(scene), ctypes.byref(extras)) or 0)
    # Read the handle before any rollback can delete the native object. If this
    # read fails, leave it allocated: an unknown registered callback must never
    # be left pointing at freed memory. Such a failure disables the session.
    raw = stable(memory, pointer, 0x68)
    handle = struct.unpack_from('<Q', raw, 0x20)[0]
    token = None
    handed = False
    try:
        if handle:
            token = {k:ctx[k] for k in ('dispatcher_weak', 'dispatcher_address')}
            token.update(handle=handle, action=int.from_bytes(bytes(action), 'little'),
                controller_address=hex(int(controller._get_address())))
        comparisons = request_fields(raw, pointer, returned, memory.base, action,
            widget, scene, int(ctx['local_player_address'],16))
        # Capture rejected requests too, while this local allocation is still
        # owned. A reporting failure still uses unregister-before-destroy.
        trace('constructed_request_validation', request_address=hex(pointer),
            native_request_hex=raw.hex(), **comparisons)
        if comparisons['mismatched_fields']:
            raise RuntimeError('Constructed native request fields differ: '+
                ', '.join(comparisons['mismatched_fields'])+'; no submit')
        retain(token)
        trace('native_submit_enter', context=ctx, copied_handle=handle,
            requester='null as initialized by native base constructor',
            native_request_hex=raw.hex())
        # Ownership is considered transferred before entering submit. Even if a
        # native call reports an exception, never risk a double free afterwards.
        handed = True
        submit(dispatcher, pointer)
        pointer = 0
    except Exception:
        if not handed:
            if token is not None: remove(memory, sdk, config, token)
            destroy(pointer, 1)
            trace('unsubmitted_request_cleanup_returned', callback_unregistered=token is not None,
                native_destroy_returned=True, queued=False)
        raise
    # Only copied integers/weak identity survive. No dereference here.
    return token
