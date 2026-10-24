"""Locate the actual installation and keep writable state outside the package."""
from __future__ import annotations
import os
from pathlib import Path
import sys


def settings_directory() -> Path:
    """The SDK owns this location, including when mods use extra search folders."""
    from mods_base import SETTINGS_DIR
    return Path(SETTINGS_DIR)


def report_directory() -> Path:
    return settings_directory() / 'bl4_echo_mod_menu'


def locate_game_root(entry_file: str | Path | None=None, working_directory: str | Path | None=None, configured_root: Path | None=None) -> Path:
    """Accept only a real directory containing both sdk_mods and the PAK folder."""
    candidates = []
    if configured_root is not None:
        candidates.append(Path(configured_root))
    anchors = []
    # The embedded SDK identifies the game via sys.executable. This also handles
    # archives installed in an SDK extra_folders location outside the game tree.
    anchors.append(Path(sys.executable).resolve().parent)
    if entry_file:
        anchors.append(Path(entry_file).resolve().parent)
    anchors.append(Path(working_directory).resolve() if working_directory is not None else Path.cwd())
    for anchor in anchors:
        candidates.extend([anchor, *list(anchor.parents)[:12]])
    visited = set()
    for candidate in candidates:
        root = candidate.resolve()
        key = os.path.normcase(str(root))
        if key in visited:
            continue
        visited.add(key)
        if (root / 'sdk_mods').is_dir() and (root / 'OakGame/Content/Paks').is_dir():
            return root
    raise RuntimeError('BL4 root not found; expected sdk_mods and OakGame/Content/Paks in the installation')
