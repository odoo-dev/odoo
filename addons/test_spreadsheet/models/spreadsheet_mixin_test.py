from odoo import models, fields


class SpreadsheetTest(models.Model):
    """ A very simple model only inheriting from spreadsheet.mixin to test
    its model functioning."""
    _description = 'Dummy Spreadsheet'
    _name = 'spreadsheet.test'
    _inherit = ['spreadsheet.mixin']

    name = fields.Char()

    def action_open_spreadsheet(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'fake_action',
            'params': {
                'spreadsheet_id': self.id,
            }
        }
