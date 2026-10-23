from unittest.mock import patch

from odoo.tests import TransactionCase
from odoo.tools import mute_logger
from odoo.tools.translate import CodeTranslations


class TestCodeTranslationsCache(TransactionCase):
    """ The code translations are shared through the `ir.cache` table. """

    def load(self, read):
        """ Load the translations like a new worker, and check whether the po
        files were read. """
        translations = CodeTranslations()
        with (
            self.registry_test_mode(),
            patch.object(CodeTranslations, '_read_translations', side_effect=CodeTranslations._read_translations) as reader,
        ):
            translations.load(['test_translation'], 'fr_FR')
        self.assertEqual(reader.called, read)
        return translations

    def test_ir_cache(self):
        self.env['ir.cache'].search([('kind', '=', 'code_translations')]).unlink()
        translations = self.load(read=True)
        cached = self.load(read=False)
        for lang_key in [('test_translation', 'fr_FR')]:
            self.assertTrue(translations.python_translations[lang_key])
            self.assertEqual(cached.python_translations[lang_key], translations.python_translations[lang_key])
            self.assertEqual(cached.web_translations[lang_key], translations.web_translations[lang_key])

        # a forged entry is ignored
        self.env.cr.execute("UPDATE ir_cache SET data = convert_to('{}', 'UTF8') WHERE kind = 'code_translations'")
        with mute_logger('odoo.addons.base.models.ir_cache'):
            self.load(read=True)

    def test_python_translations_batch(self):
        """ The first python translation of a language loads all the
        installed modules. """
        translations = CodeTranslations()
        with self.registry_test_mode():
            translations.get_python_translations('test_translation', 'fr_FR')
        self.assertIn(('base', 'fr_FR'), translations.python_translations)
