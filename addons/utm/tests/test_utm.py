# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests


class TestUtm(odoo.tests.HttpCase):
    def test_identifier_generation(self):
        source_1, source_2, source_3, source_4 = self.env['utm.source'].create([{
            'name': 'Source 1',
        }, {
            'name': 'Source 2',
        }, {
            'name': 'Source dup',
        }, {
            # Source 4 has the same name of the previous source
            'name': 'Source dup',
        }])

        self.assertEqual(source_1.identifier, 'source_1')
        self.assertEqual(source_2.identifier, 'source_2')
        self.assertEqual(source_3.identifier, 'source_dup')

        self.assertEqual(source_4.name, 'Source dup')
        self.assertNotEqual(source_4.identifier, 'source_dup')
        self.assertTrue(source_4.identifier.startswith('source_dup_['))

    def test_find_or_create_record(self):
        source_1, source_2, source_3 = self.env['utm.source'].create([{
            'name': 'Source 1',
        }, {
            'name': 'Source 2',
        }, {
            'name': 'Source 3',
        }])

        # Find the record based on the given name
        source = self.env['utm.mixin']._find_or_create_record('utm.source', 'Source 1')
        self.assertEqual(source, source_1)

        # Find the record based on the given identifier
        source = self.env['utm.mixin']._find_or_create_record('utm.source', 'source_1')
        self.assertEqual(source, source_1)

        # Create a new record and generate an identifier
        source_4 = self.env['utm.mixin']._find_or_create_record('utm.source', 'Source 4')
        self.assertNotIn(source_4, source_1 | source_2 | source_3)
        self.assertEqual(source_4.name, 'Source 4')

        # Create a new record, with the given identifier with random chars at the end
        source_5 = self.env['utm.mixin']._find_or_create_record('utm.source', 'source_5_[0123456789]')
        self.assertNotIn(source_5, source_1 | source_2 | source_3 | source_4)
        self.assertEqual(source_5.name, 'source_5_[0123456789]', 'Should have take the name from the identifier')
        self.assertEqual(source_5.identifier, 'source_5_[0123456789]', 'Should not regenerate the identifier')
