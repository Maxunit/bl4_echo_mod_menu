"""Read and write the unencrypted, uncompressed PAK v8 format used by ECHO."""
import hashlib
import io
import json
import struct
from pathlib import Path

ENTRY = struct.Struct("<QQQI20sBI")
MAX_FILES = 256


def fstring(value):
    value = value.encode("ascii") + b"\0"
    return struct.pack("<i", len(value)) + value


def read_string(stream):
    count, = struct.unpack("<i", stream.read(4))
    assert 0 < count < 4096
    raw = stream.read(count)
    assert raw[-1:] == b"\0"
    return raw[:-1].decode("ascii")


def read_pak(data):
    assert len(data) > 221
    footer = data[-221:]
    assert footer[:17] == bytes(17) and footer[61:] == bytes(160)
    magic, version, offset, size = struct.unpack_from("<IIQQ", footer, 17)
    assert (magic, version) == (0x5A6F12E1, 8)
    assert offset + size == len(data) - 221
    index = data[offset:offset+size]
    assert hashlib.sha1(index).digest() == footer[41:61]
    stream = io.BytesIO(index)
    assert read_string(stream) == "../../../"
    count, = struct.unpack("<i", stream.read(4))
    assert 0 < count <= MAX_FILES
    files = {}
    for _ in range(count):
        name = read_string(stream)
        assert name not in files
        entry = ENTRY.unpack(stream.read(ENTRY.size))
        at, compressed, plain, method, digest, flags, block = entry
        assert method == flags == block == 0 and compressed == plain
        assert at + ENTRY.size + plain <= offset
        header = ENTRY.unpack_from(data, at)
        assert header == (0, *entry[1:])
        content = data[at+ENTRY.size:at+ENTRY.size+plain]
        assert hashlib.sha1(content).digest() == digest
        files[name] = content
    assert stream.tell() == len(index)
    return files


def write_pak(files):
    if not 0 < len(files) <= MAX_FILES:
        raise ValueError('PAK resource count outside the supported build limit')
    content = bytearray()
    index = bytearray(fstring("../../../") + struct.pack("<i", len(files)))
    for name, payload in sorted(files.items()):
        offset = len(content)
        values = (len(payload), len(payload), 0, hashlib.sha1(payload).digest(), 0, 0)
        content += ENTRY.pack(0, *values) + payload
        index += fstring(name) + ENTRY.pack(offset, *values)
    at = len(content)
    content += index
    content += bytes(17) + struct.pack("<IIQQ", 0x5A6F12E1, 8, at, len(index))
    content += hashlib.sha1(index).digest() + bytes(160)
    return bytes(content)
