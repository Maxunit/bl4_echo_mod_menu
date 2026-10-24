"""Optional menu-font regeneration from pinned WOFF inputs; requires FontTools.

Normal builds consume the committed TrueType subsets and need no font tools.
Download the files listed in ui/fonts/manifest.json into one input directory.
The manifest pins the upstream commit and Git blob identity of every input.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from localization_data import required_font_codepoints

ROOT = Path(__file__).resolve().parent.parent


def rebuild(inputs, output, update_manifest=False):
    import fontTools
    from fontTools.ttLib import TTFont
    from fontTools.subset import Options, Subsetter
    from fontTools.merge import Merger
    manifest = json.loads((ROOT/'ui/fonts/manifest.json').read_text(encoding='utf-8'))
    if not update_manifest:
        assert manifest['fonttools_version'] == fontTools.__version__, 'Use the recorded FontTools version'
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='echo-fonts-') as directory:
        for row in manifest['fonts']:
            required = required_font_codepoints(row['code'])
            for start,end in row.get('extra_ranges',[]):required.update(range(start,end+1))
            parts = []
            for index, source in enumerate(row['sources']):
                data = (inputs/Path(source['path']).name).read_bytes()
                assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() == source['blob_sha']
                import io
                font = TTFont(io.BytesIO(data))
                font.flavor = None
                font.recalcTimestamp = False
                options = Options()
                options.recalc_timestamp = False
                options.layout_features = ['*']
                options.name_IDs = ['*']
                options.name_legacy = True
                options.name_languages = ['*']
                subset = Subsetter(options=options)
                subset.populate(unicodes=required & set(font.getBestCmap()))
                subset.subset(font)
                part = Path(directory)/(row['code']+'-'+str(index)+'.ttf')
                font.save(part)
                parts.append(str(part))
            font = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
            font.flavor = None
            font.recalcTimestamp = False
            font['name'].names = [name for name in font['name'].names if name.nameID not in (1,2,3,4,6,16,17)]
            family = row['family']
            for ident, text in ((1,family),(2,'Regular'),(3,family+'-1.0'),(4,family),
                                (6,'ECHOMenu-'+row['code']),(16,family),(17,'Regular')):
                font['name'].setName(text, ident, 3, 1, 0x409)
            font['head'].created = font['head'].modified = 3850070400
            target = Path(directory)/row['file']
            font.save(target)
            data = target.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if update_manifest:
                row['bytes'] = len(data)
                row['sha256'] = digest
            else:
                assert digest == row['sha256'], 'Subset differs; use the recorded FontTools version'
            (output/row['file']).write_bytes(data)
            print(row['file'], len(data), 'bytes: verified')
    if update_manifest:
        manifest['fonttools_version'] = fontTools.__version__
        (ROOT/'ui/fonts/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'ui/fonts')
    parser.add_argument('--update-manifest', action='store_true', help='Record regenerated sizes/hashes after an intentional translation or font-input change')
    args = parser.parse_args()
    rebuild(args.inputs, args.output, args.update_manifest)
