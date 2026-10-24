"""Deterministic SDKMOD archives; runtime files have exactly one package root."""
from pathlib import Path
import zipfile
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'src'
MODULE=SOURCE/'bl4_echo_mod_menu'
ARCHIVE_NAME='bl4_echo_mod_menu.sdkmod'
ZIP_TIME=(2026,1,1,0,0,0)

def runtime_files():
    return sorted(p for p in MODULE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix in ('.py','.json'))

def add_bytes(archive,name,data):
    info=zipfile.ZipInfo(name,ZIP_TIME)
    info.compress_type=zipfile.ZIP_DEFLATED
    info.create_system=3
    info.external_attr=0o100644<<16
    archive.writestr(info,data)

def write_sdkmod(destination):
    destination=Path(destination)
    if destination.name!=ARCHIVE_NAME:raise ValueError('SDKMOD filename must match its package root')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'w') as archive:
        for p in runtime_files():add_bytes(archive,p.relative_to(SOURCE).as_posix(),p.read_bytes())
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert {p.split('/')[0] for p in archive.namelist()}=={MODULE.name}
    return destination
