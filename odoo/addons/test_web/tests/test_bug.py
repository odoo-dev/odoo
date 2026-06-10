from odoo import Command
from odoo.tests.common import TransactionCase, tagged
from odoo.tools import mute_logger

@tagged('at_install', '-post_install')  # LEGACY at_install
class TestBug(TransactionCase):

    @mute_logger('odoo.models')
    def test_bug(self):
        Model = self.env['test_orm.bug']
        stored_record = Model.create({'a': 10, 'line_ids': [Command.create({'c': 5})]})
        self.assertRecordValues(stored_record, [{'a': 10, 'b': 15}])
        self.assertRecordValues(stored_record.line_ids, [{'c': 5, 'd': 15}])

        results = stored_record.onchange({'a': 20}, ['a'], stored_record._get_fields_spec())
        record_diff = {
            'b': 25,
            'line_ids': [(Command.UPDATE, stored_record.line_ids.id, {'d': 25})],
        }
        self.assertEqual(results['value'], record_diff)

        results = stored_record.onchange({**record_diff, 'a': 10}, ['a'], stored_record._get_fields_spec())
        self.assertEqual(results['value'], {
            'b': 15,
            'line_ids': [(Command.UPDATE, stored_record.line_ids.id, {'d': 15})],
        })
