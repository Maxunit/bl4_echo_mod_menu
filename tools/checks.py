"""Offline release regressions from source and an isolated SDKMOD."""
from pathlib import Path
import json,os,re,subprocess,sys,tempfile
from package_build import ROOT,write_sdkmod

def run(command,env=None,cwd=ROOT):
    result=subprocess.run(command,cwd=cwd,env=env,text=True,capture_output=True)
    print(result.stdout,end='');print(result.stderr,end='')
    if result.returncode:raise SystemExit(result.returncode)
    return result.stdout+result.stderr

def main():
    environment=dict(os.environ);environment.pop('ECHO_TEST_SDKMOD',None)
    command=[sys.executable,'-m','unittest','discover','-s','tests','-p','verify_*.py','-q']
    first=run(command,environment);count=int(re.search(r'Ran (\d+) tests',first).group(1))
    run(['node','tests/verify_prototype.js'])
    controller=run(['node','tests/verify_controller.js'])
    run(['node','tests/verify_bootstrap.js'])
    artwork=run(['node','tests/verify_artwork.js'])
    with tempfile.TemporaryDirectory(prefix='echo-sdkmod-') as directory:
        archive=write_sdkmod(Path(directory)/'bl4_echo_mod_menu.sdkmod')
        environment['ECHO_TEST_SDKMOD']=str(archive)
        second=run(command,environment)
        assert int(re.search(r'Ran (\d+) tests',second).group(1))==count
    run([sys.executable,'tools/check_repository.py'])
    report={'python_tests_per_import_mode':count,'import_modes':['source','sdkmod'],
            'controller_scenarios':int(re.search(r'PASS: (\d+) controller scenarios',controller).group(1)),
            'artwork_ui_scenarios':int(re.search(r'PASS: (\d+) artwork UI scenarios',artwork).group(1)),
            'native_cpp_and_cohtml':'modeled; native runtime is not executed by offline tests',
            'source_hygiene':'passed'}
    out=ROOT/'build';out.mkdir(exist_ok=True)
    (out/'checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('PASS: offline release regressions.')

if __name__=='__main__':main()
