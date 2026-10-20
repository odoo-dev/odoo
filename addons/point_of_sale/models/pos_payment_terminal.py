from odoo import api, fields, models


class PosPaymentTerminal(models.Model):
    """ A payment terminal of a payment method

    Several terminals of the same provider can be configured on a single
    payment method, each POS device then selects the one it uses
    The provider modules add their terminal specific settings to this model
    """
    _name = 'pos.payment.terminal'
    _description = "Point of Sale Payment Terminal"
    _order = "sequence, id"
    _inherit = ['pos.load.mixin']

    name = fields.Char(compute='_compute_name', store=True, readonly=False, precompute=True, required=True)
    payment_method_id = fields.Many2one('pos.payment.method', string="Payment Method", required=True, index=True, ondelete='cascade')
    payment_provider = fields.Selection(related='payment_method_id.payment_provider')
    sequence = fields.Integer(default=10)

    # Named once, when the terminal is added
    @api.depends('payment_method_id')
    def _compute_name(self):
        for terminal in self.filtered(lambda t: not t.name):
            other_terminals = terminal.payment_method_id.terminal_ids - terminal
            terminal.name = self.env._("Terminal %s", len(other_terminals) + 1)

    @api.model
    def _load_pos_data_domain(self, data):
        return [('payment_method_id', 'in', data['pos.payment.method'].ids)]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'payment_method_id', 'sequence']

    @api.model
    def _load_pos_data_dependencies(self):
        return ['pos.payment.method']
