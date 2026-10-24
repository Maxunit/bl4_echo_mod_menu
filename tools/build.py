"""Build installable SDKMOD/PAK packages and a deterministic developer archive."""
from pathlib import Path
import ast,hashlib,importlib.util,json,shutil,zipfile
from package_build import ROOT,SOURCE,MODULE,ARCHIVE_NAME,add_bytes,write_sdkmod,runtime_files,ordered_paths
from pak_codec import read_pak,write_pak
from font_validation import ui_fonts, RESOURCE_PREFIX
from localization_data import load_translations
PACKAGE=ROOT/'package'
DIST=ROOT/'dist'
PAK_NAME='zzz_BL4_ECHO_Mod_Menu_999_P.pak'
MANAGER='OakGame/Content/uiresources/_shared/js/widget_manager.js'
NAVIGATION='OakGame/Content/uiresources/_shared/js/navigationbar.js'

def sha(data):return hashlib.sha256(data).hexdigest()

def version():
    tree=ast.parse((MODULE/'metadata.py').read_text(encoding='utf-8'))
    return next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='VERSION' for x in n.targets))

def native_resources():
    base=ROOT/'native/resources'
    return {p.relative_to(base).as_posix():p.read_bytes() for p in ordered_paths(base.rglob('*')) if p.is_file()}

def write_native_tag_config():
    spec=importlib.util.spec_from_file_location('_echo_tag_rules',MODULE/'native_installation.py')
    rules=importlib.util.module_from_spec(spec);spec.loader.exec_module(rules)
    contents=(ROOT/'native/BL4EchoModMenu.ini').read_bytes()
    assert rules.declared_tags(contents.decode('utf-8-sig'))=={s.casefold() for s in rules.REQUIRED_TAGS}
    target=PACKAGE/rules.TAG_CONFIG;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(contents)
    return rules.inspect_tag_config(PACKAGE)

def build_ui():
    translations=load_translations()
    languages=json.loads((MODULE/'languages.json').read_text(encoding='utf-8'))
    fonts=ui_fonts()
    assert len(languages)==len({row['code'] for row in languages})==14
    parts=[(ROOT/'ui'/n).read_text(encoding='utf-8') for n in ('transport.js','controller.js','language.js','editor.js','bootstrap.js')]
    extension='\n'.join(parts).replace('__ECHO_TRANSLATIONS__',json.dumps(translations,ensure_ascii=False,separators=(',',':')))
    extension=extension.replace('__ECHO_LANGUAGES__',json.dumps(languages,ensure_ascii=False,separators=(',',':')))
    extension=extension.replace('__ECHO_LANGUAGE_FONTS__',json.dumps([{k:font[k] for k in ('code','family','file')} for font in fonts],separators=(',',':')))
    files=native_resources()
    for font in fonts:files[RESOURCE_PREFIX+font['file']]=(ROOT/'ui/fonts'/font['file']).read_bytes()
    files[MANAGER]=((ROOT/'native/widget_manager.base.js').read_text(encoding='utf-8')+"\n;(function () {\n'use strict';\n"+extension+'\n})();\n').encode()
    files[NAVIGATION]=((ROOT/'native/navigationbar.base.js').read_text(encoding='utf-8')+'\n;\n'+(ROOT/'ui/navigation.js').read_text(encoding='utf-8')).encode()
    packed=write_pak(files);assert read_pak(packed)==files
    output=PACKAGE/'OakGame/Content/Paks'/PAK_NAME;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(packed)
    staging=ROOT/'build';staging.mkdir(exist_ok=True)
    (staging/'widget_manager.js').write_bytes(files[MANAGER]);(staging/'navigationbar.js').write_bytes(files[NAVIGATION])
    return {n:sha(v) for n,v in files.items()}

def build_example():
    source=ROOT/'examples/echo_menu_example'
    target=PACKAGE/'examples/echo_menu_example.sdkmod';target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w') as archive:
        for p in ordered_paths(source.rglob('*.py')):add_bytes(archive,'echo_menu_example/'+p.relative_to(source).as_posix(),p.read_bytes())

def source_files():
    for folder in ('src','ui','native','tools','tests','docs','examples','.github','licenses'):
        for p in ordered_paths((ROOT/folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':yield p
    for name in ('README.md','CHANGELOG.md','COMPATIBILITY.md','THIRD_PARTY_NOTICES.md','.gitignore','.gitattributes'):
        yield ROOT/name

def main():
    release=version();assert all(s.isdigit() for s in release.split('.'))
    for folder in (SOURCE,ROOT/'tools',ROOT/'tests',ROOT/'examples'):
        for p in folder.rglob('*.py'):
            if '__pycache__' not in p.parts:ast.parse(p.read_text(encoding='utf-8'),filename=p.name)
    if PACKAGE.exists():shutil.rmtree(PACKAGE)
    PACKAGE.mkdir();DIST.mkdir(exist_ok=True)
    write_sdkmod(PACKAGE/'sdk_mods'/ARCHIVE_NAME)
    hashes=build_ui();write_native_tag_config();build_example()
    for name in ('README.md','CHANGELOG.md','COMPATIBILITY.md','THIRD_PARTY_NOTICES.md'):shutil.copyfile(ROOT/name,PACKAGE/name)
    (PACKAGE/'docs').mkdir()
    for name in ('CONTROLS.md','MOD_AUTHORS.md','API.md'):
        shutil.copyfile(ROOT/'docs'/name,PACKAGE/'docs'/name)
    shutil.copytree(ROOT/'licenses',PACKAGE/'licenses')
    manifest={'version':release,'provider_api':1,'distribution':'sdkmod','resources_sha256':hashes,
              'native_profile':'Steam 1.11 / PE 0xf38df04c / image size 0x26e12000',
              'runtime_sha256':{p.relative_to(SOURCE).as_posix():sha(p.read_bytes()) for p in runtime_files()}}
    (PACKAGE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    files=ordered_paths(p for p in PACKAGE.rglob('*') if p.is_file())
    (PACKAGE/'SHA256SUMS.txt').write_text(''.join(sha(p.read_bytes())+'  '+p.relative_to(PACKAGE).as_posix()+'\n' for p in files),encoding='utf-8',newline='\n')
    installer=DIST/('ECHO_Mod_Menu_'+release+'.zip')
    with zipfile.ZipFile(installer,'w') as archive:
        for p in files+[PACKAGE/'SHA256SUMS.txt']:add_bytes(archive,p.relative_to(PACKAGE).as_posix(),p.read_bytes())
    sources=DIST/('ECHO_Mod_Menu_'+release+'_sources.zip')
    with zipfile.ZipFile(sources,'w') as archive:
        for p in source_files():add_bytes(archive,p.relative_to(ROOT).as_posix(),p.read_bytes())
    for target in (installer,sources):
        with zipfile.ZipFile(target) as archive:assert archive.testzip() is None
        print(target.name,target.stat().st_size,sha(target.read_bytes()))
    (DIST/'SHA256SUMS.txt').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in (installer,sources)),encoding='utf-8',newline='\n')
    print('Build complete: one SDKMOD, native PAK, required tag INI, optional example, English docs and reproducible sources.')

if __name__=='__main__':main()
