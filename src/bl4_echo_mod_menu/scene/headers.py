"""Header diagnostics preserve section anomalies; never authorize native calls."""
import hashlib
import struct
from pathlib import Path


def parse_headers(reader):
    base = reader.base
    dos = reader.read(base, 64)
    if dos[:2] != b'MZ':
        raise ValueError('Missing MZ signature')
    offset, = struct.unpack_from('<I', dos, 60)
    if not 64 <= offset <= 1024**2:
        raise ValueError('PE header offset outside bound')
    coff = reader.read(base + offset, 24)
    if coff[:4] != b'PE\0\0':
        raise ValueError('Missing PE signature')
    machine, count, stamp = struct.unpack_from('<HHI', coff, 4)
    length, = struct.unpack_from('<H', coff, 20)
    if machine != 0x8664 or not 1 <= count <= 256 or not 112 <= length <= 4096:
        raise ValueError('Unsupported PE machine/header bounds')
    optional = reader.read(base + offset + 24, length)
    if optional[:2] != b'\x0b\x02':
        raise ValueError('Not a PE32+ optional header')
    size, header_size = struct.unpack_from('<II', optional, 56)
    position = offset + 24 + length
    if position + count * 40 > 2 * 1024**2:
        raise ValueError('Section table exceeds header-read bound')
    table = reader.read(base + position, count * 40)
    warnings, sections, names = [], [], set()
    if not position + count * 40 <= header_size <= 2 * 1024**2 or size <= header_size:
        warnings.append('header_or_image_size_relationship')
    for index in range(count):
        raw = table[index * 40:(index + 1) * 40]
        name_raw = raw[:8].split(b'\0', 1)[0]
        name = name_raw.decode('ascii', errors='replace')
        virtual_size, rva, disk_size, disk_offset = struct.unpack_from('<IIII', raw, 8)
        flags, = struct.unpack_from('<I', raw, 36)
        span = virtual_size or disk_size
        issues = []
        if name in names:
            issues.append('duplicate_section_name')
        if not header_size <= rva < size or not 0 < span <= max(0, size - rva):
            issues.append('section_virtual_range_unusual')
        if any(value > 127 for value in name_raw):
            issues.append('non_ascii_section_name')
        names.add(name)
        sections.append({'index': index, 'name': name, 'name_hex': raw[:8].hex(),
            'rva': rva, 'size': span, 'virtual_size': virtual_size,
            'raw_size': disk_size, 'raw_offset': disk_offset, 'flags': flags, 'warnings': issues})
        warnings.extend(f'section_{index}:{issue}' for issue in issues)
    ordered = sorted(sections, key=lambda row: row['rva'])
    if any(a['rva'] + a['size'] > b['rva'] for a, b in zip(ordered, ordered[1:])):
        warnings.append('overlapping_virtual_section_ranges')
    return {'image_size': size, 'pe_timestamp': stamp,
        'header_sha256': hashlib.sha256(dos + coff + optional + table).hexdigest(),
        'sections': sections, 'warnings': warnings,
        'header_parts_hex': {'dos': dos.hex(), 'coff': coff.hex(),
            'optional': optional.hex(), 'section_table': table.hex()},
        'diagnostic_only': True, 'native_call_approval': False}


class DiskHeaders:
    base = 0

    def __init__(self, handle, size):
        self.handle, self.size = handle, size

    def read(self, offset, size):
        if not 0 <= offset <= self.size or not 0 <= size <= min(2 * 1024**2, self.size - offset):
            raise ValueError('Disk header read outside bound')
        self.handle.seek(offset)
        raw = self.handle.read(size)
        if len(raw) != size:
            raise ValueError('Short disk header read')
        return raw


def disk_capture(root):
    path = (Path(root) / 'OakGame/Binaries/Win64/Borderlands4.exe').resolve()
    if not path.is_relative_to(Path(root).resolve()):
        raise ValueError('Executable outside selected game directory')
    before = path.stat()
    if not 0 < before.st_size <= 2 * 1024**3:
        raise ValueError('EXE size outside hash bound')
    with path.open('rb') as handle:
        digest, count = hashlib.sha256(), 0
        while True:
            raw = handle.read(1024**2)
            if not raw:
                break
            count += len(raw)
            if count > 2 * 1024**3:
                raise ValueError('EXE grew beyond hash bound')
            digest.update(raw)
        result = {'path': str(path), 'bytes': count, 'sha256': digest.hexdigest()}
        try:
            result['headers'] = parse_headers(DiskHeaders(handle, count))
        except (OSError, ValueError, struct.error) as exc:
            result['header_error'] = type(exc).__name__ + ': ' + str(exc)[:200]
    after = path.stat()
    if count != before.st_size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError('EXE changed during capture')
    return result
