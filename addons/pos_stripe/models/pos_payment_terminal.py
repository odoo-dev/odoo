from odoo import api, fields, models
from odoo.exceptions import ValidationError


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    stripe_serial_number = fields.Char(help='[Serial number of the Stripe terminal], for example: WSC513105011295', copy=False)

    @api.model
    def _load_pos_data_fields(self, config):
        return [*super()._load_pos_data_fields(config), 'stripe_serial_number']

    @api.constrains('stripe_serial_number')
    def _check_stripe_serial_number(self):
        for terminal in self:
            if not terminal.stripe_serial_number:
                continue
            existing_terminal = self.search([
                ('id', '!=', terminal.id),
                ('stripe_serial_number', '=', terminal.stripe_serial_number),
            ], limit=1)
            if existing_terminal:
                raise ValidationError(self.env._(
                    'Terminal %(terminal)s is already used on payment method %(payment_method)s.',
                    terminal=terminal.stripe_serial_number,
                    payment_method=existing_terminal.payment_method_id.display_name,
                ))
