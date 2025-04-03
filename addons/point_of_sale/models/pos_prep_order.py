from odoo import fields, models, api


# serves as a group of diff made in an order
class PosPrepOrder(models.Model):
    _name = 'pos.prep.order'
    _description = 'Pos Preparation Order'
    _inherit = ['pos.load.mixin']

    # Basic Fields
    uuid = fields.Char('UUID')
    customer_note = fields.Char('Customer Note', help='Null value means customer note is not changed.')
    internal_note = fields.Json('Internal Note', help='Null value means internal note is not changed.')

    # Relational Fields
    pos_order_id = fields.Many2one('pos.order', string='Order')
    prep_line_ids = fields.One2many('pos.prep.line', 'prep_order_id', string='Preparation Lines')
    pos_printer_ids = fields.Many2many('pos.printer', string='Printers', help='Printers where this preparation order is printed.')
    prev_prep_order_id = fields.Many2one('pos.prep.order', string='Previous Preparation Order', help='Used to derive the previous customer_note and internal_note values.')

    # Computed Fields
    order_name = fields.Char('Order Name', compute='_compute_order_name', store=True)

    @api.depends('pos_order_id')
    def _compute_order_name(self):
        for order in self:
            order.order_name = order.pos_order_id.tracking_number
