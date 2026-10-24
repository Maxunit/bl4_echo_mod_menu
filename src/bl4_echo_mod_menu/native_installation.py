"""Read-only check of the external tag definitions used by the native UI PAK.

The SDKMOD cannot carry Unreal's startup tag config inside its Python archive.
This check proves declarations exist on disk, not that the running engine has
imported them. Installing/changing the INI requires a full game restart.
"""
from __future__ import annotations
import hashlib
from pathlib import Path
import re

TAG_CONFIG = 'OakGame/Config/Tags/BL4EchoModMenu.ini'
REQUIRED_TAGS = ('UI.Tag.BL4_MODS_EMPTY_V39', 'UI.State.MENU_BL4_MODS_EMPTY_V39')
_SECTION = '/script/gameplaytags.gameplaytagslist'
_ENTRY = re.compile(r'^\+?GameplayTagList\s*=\s*\(\s*Tag\s*=\s*"([^"]+)"', re.I)


def declared_tags(contents):
    """Read Unreal's repeated GameplayTagList entries, preserving both tags."""
    section, result = '', set()
    for line in contents.splitlines():
        line = line.strip()
        if line.startswith('[') and line.endswith(']'):
            section = line[1:-1].casefold()
        elif section == _SECTION:
            match = _ENTRY.match(line)
            if match:
                result.add(match[1].casefold())
    return result


def inspect_tag_config(game_root):
    root = Path(game_root)
    folder = root / 'OakGame/Config/Tags'
    required = {name.casefold() for name in REQUIRED_TAGS}
    declarations, files = set(), []
    if folder.is_dir():
        candidates = [path for path in folder.iterdir() if path.is_file()
                      and path.name.casefold() == 'bl4echomodmenu.ini']
        if len(candidates) > 64:
            raise RuntimeError('ECHO tag config file bound exceeded')
        for path in candidates:
            if path.stat().st_size > 256 * 1024:
                raise RuntimeError('ECHO tag config exceeds its read bound: ' + path.name)
            raw = path.read_bytes()
            found = declared_tags(raw.decode('utf-8-sig'))
            declarations.update(found)
            files.append({'path': path.relative_to(root).as_posix(),
                          'sha256': hashlib.sha256(raw).hexdigest(),
                          'required_tags_declared': sorted(required & found)})
    missing = [name for name in REQUIRED_TAGS if name.casefold() not in declarations]
    return {'status': 'incomplete' if missing else 'declared_on_disk', 'files': files,
            'expected_config': TAG_CONFIG, 'required_tags': list(REQUIRED_TAGS),
            'missing_tags': missing, 'runtime_import_verified': False,
            'game_restart_required_after_install': True}


def require_tag_config(entry_file=None):
    from .paths import locate_game_root
    state = inspect_tag_config(locate_game_root(entry_file))
    if state['missing_tags']:
        raise RuntimeError('Required ECHO native tag config missing/incomplete: ' + TAG_CONFIG +
                           '; install the OakGame files from the release and restart BL4')
    return state
