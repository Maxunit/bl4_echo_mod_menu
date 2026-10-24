"""Rebuild a clean extracted developer archive and compare both ZIP outputs."""
from pathlib import Path
import subprocess,sys,tempfile,zipfile
from build import ROOT,version

def main():
    release=version();installer='ECHO_Mod_Menu_'+release+'.zip';sources='ECHO_Mod_Menu_'+release+'_sources.zip'
    with tempfile.TemporaryDirectory(prefix='echo-rebuild-') as directory:
        clean=Path(directory)
        with zipfile.ZipFile(ROOT/'dist'/sources) as archive:archive.extractall(clean)
        result=subprocess.run([sys.executable,'tools/build.py'],cwd=clean,text=True,capture_output=True)
        assert result.returncode==0,result.stdout+'\n'+result.stderr
        for name in (installer,sources):assert (clean/'dist'/name).read_bytes()==(ROOT/'dist'/name).read_bytes(),name
    print('PASS: clean developer-archive rebuild is byte-identical.')

if __name__=='__main__':main()
