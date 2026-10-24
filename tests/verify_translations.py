"""Complete translations retain the UI's dynamic formatting contract."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import json
import unittest
from localization_data import ROOT, load_translations


class Tests(unittest.TestCase):
    def test_all_fourteen_languages_have_complete_nonempty_text(self):
        dictionaries=load_translations()
        self.assertEqual(len(dictionaries),14)
        self.assertEqual(len(dictionaries['en']),88)
        for code,entries in dictionaries.items():
            self.assertEqual(set(entries),set(dictionaries['en']),code)
            for key in ('save','hint','backendError','captureWaitInline','controllerBrowse'):
                self.assertTrue(entries[key].strip(),(code,key))

    def test_all_message_arguments_format_without_missing_names(self):
        values={'n':3,'min':-10,'max':10,'step':1,'state':'Enabled','name':'F5'}
        for code,entries in load_translations().items():
            for key,text in entries.items():
                formatted=text.format(**values)
                self.assertNotIn('{',formatted,(code,key))
                self.assertNotIn('}',formatted,(code,key))


if __name__=='__main__':unittest.main()
