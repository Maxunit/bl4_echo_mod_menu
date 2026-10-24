"""The selector ships real glyphs instead of assuming OS font availability."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import unittest
from font_validation import ROOT, label_fonts, glyph_index


class Tests(unittest.TestCase):
    def test_bundled_fonts_cover_each_native_name_and_have_licenses(self):
        fonts = label_fonts()
        self.assertEqual(len(fonts),5)
        self.assertLess(sum(font['bytes'] for font in fonts),16384)

    def test_subset_does_not_claim_coverage_for_unrelated_text(self):
        for font in label_fonts():
            data = (ROOT/'ui/fonts'/font['file']).read_bytes()
            self.assertEqual(glyph_index(data,ord('A')),0)
            self.assertEqual(glyph_index(data,ord(' ')),0)


if __name__ == '__main__': unittest.main()
