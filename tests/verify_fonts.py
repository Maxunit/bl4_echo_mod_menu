"""All translated ECHO text has bundled glyphs, independent of OS font packs."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import unittest
from font_validation import ROOT, ui_fonts, glyph_index


class Tests(unittest.TestCase):
    def test_bundled_fonts_cover_all_menu_translations_and_native_names(self):
        fonts = ui_fonts()
        self.assertEqual(len(fonts),6)
        self.assertLess(sum(font['bytes'] for font in fonts),1048576)

    def test_subset_does_not_claim_coverage_for_unrelated_text(self):
        for font in ui_fonts():
            data = (ROOT/'ui/fonts'/font['file']).read_bytes()
            self.assertEqual(glyph_index(data,0x1f600),0)
            if font['code']=='latin':
                self.assertNotEqual(glyph_index(data,ord('A')),0)
                self.assertNotEqual(glyph_index(data,ord('Я')),0)


if __name__ == '__main__': unittest.main()
