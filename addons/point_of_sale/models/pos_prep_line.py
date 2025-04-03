from odoo import fields, models


class PosPrepLine(models.Model):
    _name = 'pos.prep.line'
    _description = 'Pos Preparation Line'
    _inherit = ['pos.load.mixin']

    # Basic Fields
    uuid = fields.Char('UUID')
    quantity = fields.Float('Quantity', required=True)
    cancelled = fields.Float("Quantity of cancelled product", default=0.0)
    note = fields.Json('Note', help='Null value means note is not changed.')
    pos_line_info = fields.Json(string='Line info', help='Constant values from `pos_line_id`. This is needed because `pos_line_id` can be empty when the linked record is deleted.')

    # Relational Fields
    pos_line_id = fields.Many2one('pos.order.line', string='Order line', help='Can only be empty when the linked record is deleted.')
    prep_order_id = fields.Many2one('pos.prep.order', string='Preparation Order', required=True, ondelete='cascade')
    pos_printer_ids = fields.Many2many('pos.printer', string='Preparation Printers', help='Preparation printers where this preparation order is sent.')
    prev_prep_line_id = fields.Many2one('pos.prep.line', string='Previous Preparation Line', help='Used to derive the previous note and quantity values.')
