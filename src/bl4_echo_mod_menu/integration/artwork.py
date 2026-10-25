"""Optional, bounded presentation assets captured on the game thread.

Only already loaded mod packages are read. HTTP receives immutable PNG bytes
and opaque content identifiers, never package names, paths or SDK objects.
"""
from __future__ import annotations

from hashlib import sha256
from importlib.resources import files
from pathlib import Path, PurePosixPath
import re
import struct
import sys
from types import ModuleType
from typing import Any
from zlib import crc32

from ..resources import read_json

ARTWORK_ATTRIBUTE = 'echo_menu_artwork'
BUILTIN_ICONS = frozenset(
    row['id'] for row in read_json('bl4_echo_mod_menu', 'icons.json')['icons']
)
MAX_PNG_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_DIMENSION = 4096
MAX_PIXELS = 8 * 1024 * 1024
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


def png_dimensions(data: bytes) -> tuple[int, int]:
    """Check bounded static PNG structure and chunk CRCs before Cohtml sees it.

    The renderer owns pixel decoding. Its image-error event handles streams
    whose pixel payload cannot be decoded despite a valid container.
    """
    if not 45 <= len(data) <= MAX_PNG_BYTES or not data.startswith(PNG_SIGNATURE):
        raise ValueError('Expected a bounded PNG')
    offset = 8
    dimensions = None
    palette = False
    pixels = False
    ended_pixels = False
    color_type = -1
    chunks = 0
    while offset < len(data):
        chunks += 1
        if chunks > 4096 or offset + 12 > len(data):
            raise ValueError('Invalid PNG chunk count or length')
        size = struct.unpack_from('>I', data, offset)[0]
        end = offset + 12 + size
        if end > len(data):
            raise ValueError('Truncated PNG chunk')
        kind = data[offset + 4:offset + 8]
        body = memoryview(data)[offset + 8:end - 4]
        checksum = crc32(body, crc32(kind)) & 0xffffffff
        if checksum != struct.unpack_from('>I', data, end - 4)[0]:
            raise ValueError('Invalid PNG checksum')
        if dimensions is None and kind != b'IHDR':
            raise ValueError('PNG header must be first')
        if kind == b'IHDR':
            if dimensions is not None or size != 13:
                raise ValueError('Invalid PNG header')
            width, height, depth, color_type, compression, filtering, interlace = (
                struct.unpack('>IIBBBBB', body)
            )
            depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8),
                      4: (8, 16), 6: (8, 16)}
            if (not 0 < width <= MAX_DIMENSION or not 0 < height <= MAX_DIMENSION
                    or width * height > MAX_PIXELS
                    or depth not in depths.get(color_type, ())
                    or compression != 0 or filtering != 0 or interlace not in (0, 1)):
                raise ValueError('Unsupported PNG dimensions or format')
            dimensions = (width, height)
        elif kind == b'PLTE':
            if palette or pixels or size == 0 or size > 768 or size % 3:
                raise ValueError('Invalid PNG palette')
            palette = True
        elif kind == b'IDAT':
            if ended_pixels or color_type == 3 and not palette:
                raise ValueError('Invalid PNG image sequence')
            pixels = True
        elif kind == b'IEND':
            if size != 0 or not pixels or end != len(data):
                raise ValueError('Invalid PNG ending')
            return dimensions
        elif kind == b'acTL' or not kind or not kind[0] & 32:
            raise ValueError('Unsupported animated or critical PNG chunk')
        if pixels and kind != b'IDAT':
            ended_pixels = True
        offset = end
    raise ValueError('Incomplete PNG')


def resource_path(value: Any) -> PurePosixPath:
    """Accept one canonical relative PNG path, including inside an SDKMOD."""
    if (type(value) is not str or not 1 <= len(value) <= 240
            or any(char in value for char in ('\\', ':', '\x00', '?', '#', '%'))):
        raise ValueError('Expected a relative PNG resource')
    path = PurePosixPath(value)
    if (path.is_absolute() or path.as_posix() != value
            or any(part in ('.', '..') for part in path.parts)
            or path.suffix.lower() != '.png'):
        raise ValueError('Expected a canonical relative PNG resource')
    return path


class ArtworkCatalog:
    """A single capture's bytes and metadata; no mod/actor references retained."""

    def __init__(self) -> None:
        self.assets: dict[str, bytes] = {}
        self.cache: dict[tuple[str, str], dict[str, Any]] = {}
        self.total_bytes = 0

    def image(self, mod: Any, package_name: Any, value: Any) -> dict[str, Any]:
        path = resource_path(value)
        if type(package_name) is not str or len(package_name) > 160:
            raise ValueError('Artwork requires its loaded package name')
        package = sys.modules.get(package_name)
        if (not isinstance(package, ModuleType)
                or not any(item is mod for item in vars(package).values())):
            raise ValueError('Artwork package must already own this registered mod')
        key = (package_name, str(path))
        if key in self.cache:
            return dict(self.cache[key])
        root = files(package)
        resource = root.joinpath(*path.parts)
        if isinstance(root, Path) and isinstance(resource, Path):
            # A package-local symlink must not escape its resource directory.
            resource.resolve().relative_to(root.resolve())
        with resource.open('rb') as stream:
            data = stream.read(MAX_PNG_BYTES + 1)
        width, height = png_dimensions(data)
        asset_id = sha256(data).hexdigest()
        if asset_id not in self.assets:
            if self.total_bytes + len(data) > MAX_TOTAL_BYTES:
                raise ValueError('Artwork capture byte limit reached')
            self.assets[asset_id] = data
            self.total_bytes += len(data)
        result = {'id': asset_id, 'width': width, 'height': height}
        self.cache[key] = result
        return dict(result)

    def decorate(self, mod: Any, row: dict[str, Any]) -> None:
        """Ignore broken optional artwork without touching settings bindings."""
        try:
            source = getattr(mod, ARTWORK_ATTRIBUTE, None)
            if source is None:
                return
            if (type(source) is not dict
                    or set(source) - {'package', 'icon', 'header', 'category_icons'}):
                raise ValueError('Invalid artwork declaration')
            result: dict[str, Any] = {}
            warnings = []
            for slot in ('icon', 'header'):
                value = source.get(slot)
                if value is None:
                    continue
                if slot == 'icon' and type(value) is str and value in BUILTIN_ICONS:
                    result[slot] = value
                    continue
                try:
                    result[slot] = self.image(mod, source.get('package'), value)
                except (OSError, ValueError, TypeError, AttributeError, ImportError,
                        struct.error, RuntimeError):
                    warnings.append(slot + '_unavailable')
            categories = source.get('category_icons', {})
            if type(categories) is dict and len(categories) <= 64:
                result['category_icons'] = {
                    key: value for key, value in categories.items()
                    if type(key) is str and re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', key)
                    and type(value) is str and value in BUILTIN_ICONS
                }
                if len(result['category_icons']) != len(categories):
                    warnings.append('category_icons_unavailable')
            else:
                warnings.append('category_icons_unavailable')
            if warnings:
                result['warnings'] = warnings
            row['artwork'] = result
        except Exception:
            # An arbitrary mod property may itself raise. Presentation is an
            # isolation boundary and must never remove this mod's SDK settings.
            row['artwork'] = {'warnings': ['declaration_unavailable']}
