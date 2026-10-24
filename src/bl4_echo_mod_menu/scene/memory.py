"""Read the current process only, through checked ReadProcessMemory calls."""
import ctypes
import os
import struct
from pathlib import Path
from ctypes import wintypes


class MemoryBasicInformation64(ctypes.Structure):
    _fields_ = [('BaseAddress', ctypes.c_uint64), ('AllocationBase', ctypes.c_uint64),
        ('AllocationProtect', ctypes.c_uint32), ('Alignment1', ctypes.c_uint32),
        ('RegionSize', ctypes.c_uint64), ('State', ctypes.c_uint32),
        ('Protect', ctypes.c_uint32), ('Type', ctypes.c_uint32), ('Alignment2', ctypes.c_uint32)]


class CurrentImage:
    def __init__(self, game_root):
        if os.name != 'nt' or ctypes.sizeof(ctypes.c_void_p) != 8:
            raise RuntimeError('Requires 64-bit Windows inside BL4')
        api = ctypes.WinDLL('kernel32', use_last_error=True)
        api.GetCurrentProcess.argtypes = []
        api.GetCurrentProcess.restype = wintypes.HANDLE
        api.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
        api.GetModuleHandleW.restype = wintypes.HMODULE
        api.GetModuleFileNameW.argtypes = [wintypes.HMODULE, wintypes.LPWSTR, wintypes.DWORD]
        api.GetModuleFileNameW.restype = wintypes.DWORD
        api.ReadProcessMemory.argtypes = [wintypes.HANDLE, ctypes.c_void_p,
            ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
        api.ReadProcessMemory.restype = wintypes.BOOL
        api.VirtualQuery.argtypes = [ctypes.c_void_p, ctypes.POINTER(MemoryBasicInformation64), ctypes.c_size_t]
        api.VirtualQuery.restype = ctypes.c_size_t
        api.RtlLookupFunctionEntry.argtypes = [ctypes.c_uint64,
            ctypes.POINTER(ctypes.c_uint64), ctypes.c_void_p]
        api.RtlLookupFunctionEntry.restype = ctypes.c_void_p
        self.base = int(api.GetModuleHandleW(None) or 0)
        if not self.base:
            raise OSError(ctypes.get_last_error(), 'GetModuleHandleW failed')
        buffer = ctypes.create_unicode_buffer(32768)
        length = api.GetModuleFileNameW(self.base, buffer, len(buffer))
        if not length or length >= len(buffer):
            raise OSError(ctypes.get_last_error(), 'GetModuleFileNameW failed')
        path = Path(buffer.value).resolve()
        if not path.is_relative_to(Path(game_root).resolve()):
            raise RuntimeError('Main executable is outside the validated game directory')
        self.path = str(path)
        self.image_size = 2 * 1024**2  # Header-only until the loaded build matches.
        self.process = api.GetCurrentProcess()
        self.rpm = api.ReadProcessMemory
        self.query = api.VirtualQuery
        self.lookup = api.RtlLookupFunctionEntry

    def set_image_size(self, size):
        if not 0 < size <= 2 * 1024**3:
            raise ValueError('Image bound invalid')
        self.image_size = size

    def function_range(self, address, image_size):
        image_base = ctypes.c_uint64()
        pointer = int(self.lookup(address, ctypes.byref(image_base), None) or 0)
        if not pointer:
            return {'status': 'no_entry'}
        if image_base.value != self.base:
            return {'status': 'different_image'}
        if not self.base <= pointer <= self.base + image_size - 12:
            return {'status': 'table_outside_image'}
        begin, end, unwind = struct.unpack('<III', self.read(pointer, 12))
        if not 0 <= begin <= address - self.base < end <= image_size:
            return {'status': 'invalid_range'}
        return {'status': 'resolved', 'begin_rva': begin, 'end_rva': end, 'unwind_rva': unwind}

    def regions(self, size):
        if not 0 < size <= 2 * 1024**3:
            raise ValueError('Image size outside bounds')
        cursor, end = self.base, self.base + size
        rows = []
        while cursor < end:
            if len(rows) >= 4096:
                raise ValueError('VirtualQuery region limit reached')
            info = MemoryBasicInformation64()
            actual = self.query(cursor, ctypes.byref(info), ctypes.sizeof(info))
            if actual != ctypes.sizeof(info):
                raise OSError(ctypes.get_last_error(), 'VirtualQuery failed')
            region_end = info.BaseAddress + info.RegionSize
            if info.BaseAddress > cursor or region_end <= cursor:
                raise ValueError('Invalid VirtualQuery range')
            stop = min(end, region_end)
            protection = info.Protect & 0xFF
            readable = (info.State == 0x1000 and not info.Protect & 0x100 and
                protection in (0x02, 0x04, 0x08, 0x20, 0x40, 0x80))
            rows.append({'rva': cursor - self.base, 'size': stop - cursor,
                'state': int(info.State), 'protection': int(info.Protect),
                'readable': readable, 'executable': readable and protection in (0x20, 0x40, 0x80)})
            cursor = stop
        return rows

    def read(self, address, size):
        if (not self.base <= address <= self.base + self.image_size
                or not 0 <= size <= min(2 * 1024**2, self.base + self.image_size - address)):
            raise ValueError('Read outside permitted address/size bounds')
        buffer = ctypes.create_string_buffer(size)
        actual = ctypes.c_size_t()
        if not self.rpm(self.process, address, buffer, size, ctypes.byref(actual)) or actual.value != size:
            raise OSError(ctypes.get_last_error(), f'ReadProcessMemory failed at {address:#x}, size={size}')
        return buffer.raw


    def read_owned(self, address, size):
        """Small reads of SDK-resolved objects/temporaries; check live page access."""
        if not 0x10000 <= address < 0x800000000000 or not 0 < size <= 4096:
            raise ValueError('Owned-object read outside fixed bounds')
        cursor, end = address, address + size
        while cursor < end:
            info = MemoryBasicInformation64()
            if self.query(cursor, ctypes.byref(info), ctypes.sizeof(info)) != ctypes.sizeof(info):
                raise OSError(ctypes.get_last_error(), 'Owned-object VirtualQuery failed')
            stop = info.BaseAddress + info.RegionSize
            protection = info.Protect & 0xFF
            if info.BaseAddress > cursor or stop <= cursor or info.State != 0x1000 or info.Protect & 0x100 or protection not in (2, 4, 8, 0x20, 0x40, 0x80):
                raise ValueError('Owned-object range is not readable')
            cursor = min(stop, end)
        buffer = ctypes.create_string_buffer(size)
        actual = ctypes.c_size_t()
        if not self.rpm(self.process, address, buffer, size, ctypes.byref(actual)) or actual.value != size:
            raise OSError(ctypes.get_last_error(), 'Owned-object ReadProcessMemory failed')
        return buffer.raw


    def initialize_request_allocation(self, address):
        """Zero only a just-returned, unconstructed 0x68-byte engine allocation.

        Called once, before the native constructor registers any callback and
        before ownership can pass to the queue. Never used on a live request.
        """
        size = 0x68
        if not 0x10000 <= address < 0x800000000000-size or address % 16:
            raise ValueError('Fresh native request allocation address/alignment differs')
        cursor, end = address, address+size
        while cursor < end:
            info = MemoryBasicInformation64()
            if self.query(cursor, ctypes.byref(info), ctypes.sizeof(info)) != ctypes.sizeof(info):
                raise OSError(ctypes.get_last_error(), 'Allocation VirtualQuery failed')
            stop = int(info.BaseAddress)+int(info.RegionSize)
            if (info.BaseAddress > cursor or stop <= cursor or info.State != 0x1000 or
                info.Protect & 0x100 or (info.Protect & 0xFF) not in (0x04, 0x08, 0x40, 0x80)):
                raise ValueError('Fresh request allocation is not writable')
            cursor = min(stop, end)
        ctypes.memset(address, 0, size)
        if self.read_owned(address, size) != bytes(size):
            raise RuntimeError('Fresh request allocation did not remain zero before construction')
