"""Check public source/package hygiene without reading runtime user directories."""
from pathlib import Path
import re,zipfile
from build import ROOT,source_files

PATTERNS=[
    re.compile(rb'[/](?:workspace|Users|home)[/]'),
    re.compile(rb'[A-Za-z]:[\\/](?:Users|SteamLibrary)[\\/]',re.I),
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]

def check_bytes(name,data):
    for pattern in PATTERNS:
        if pattern.search(data):raise AssertionError('Private path or credential-like content: '+name)
    if name.endswith(('.zip','.sdkmod')):
        import io
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            assert archive.testzip() is None
            for n in archive.namelist():
                assert not any(p in n.split('/') for p in ('__pycache__','settings','reports'))
                check_bytes(name+'!'+n,archive.read(n))

def main():
    files=list(source_files())
    for p in files:
        assert p.is_file(),p
        check_bytes(p.relative_to(ROOT).as_posix(),p.read_bytes())
    package=ROOT/'package'
    for p in package.rglob('*') if package.exists() else []:
        if p.is_file():check_bytes(p.relative_to(ROOT).as_posix(),p.read_bytes())
    print('PASS: public sources/package contain no runtime settings, captures, private paths or credential-like data.')

if __name__=='__main__':main()
