"""ASLR-independent header identity; permits duplicate names, rejects bad ranges."""
import hashlib
import struct
from .headers import parse_headers


def canonical_header(parts):
    decoded = {key: bytes.fromhex(parts[key])
        for key in ('dos', 'coff', 'optional', 'section_table')}
    optional = bytearray(decoded['optional'])
    if len(optional) < 112:
        raise ValueError('Short optional header')
    optional[24:32] = bytes(8)  # ImageBase alone; retain every other recorded byte.
    return hashlib.sha256(decoded['dos'] + decoded['coff'] + optional + decoded['section_table']).hexdigest()


def image_info(memory):
    result = parse_headers(memory)
    invalid = [value for value in result['warnings']
        if not value.endswith(':duplicate_section_name')]
    if invalid:
        raise ValueError('Invalid PE layout: ' + ', '.join(invalid))
    if not 0 < result['image_size'] <= 2 * 1024**3:
        raise ValueError('Image size outside scan bound')
    optional = bytes.fromhex(result['header_parts_hex']['optional'])
    image_base, = struct.unpack_from('<Q', optional, 24)
    result.update(canonical_header_sha256=canonical_header(result['header_parts_hex']),
        image_base_in_header=hex(image_base), actual_base=hex(memory.base),
        canonicalization='Zero only OptionalHeader.ImageBase[24:32] before SHA256',
        native_call_approval=False)
    return result
