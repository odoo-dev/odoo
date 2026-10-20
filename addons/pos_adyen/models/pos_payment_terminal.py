from odoo import api, fields, models
from odoo.exceptions import ValidationError


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    adyen_terminal_identifier = fields.Char(help='[Terminal model]-[Serial number], for example: P400Plus-123456789', copy=False)
    adyen_latest_response = fields.Char(copy=False, groups='base.group_erp_manager')  # used to buffer the latest asynchronous notification from Adyen

    @api.model
    def _load_pos_data_fields(self, config):
        return [*super()._load_pos_data_fields(config), 'adyen_terminal_identifier']

    @api.constrains('adyen_terminal_identifier')
    def _check_adyen_terminal_identifier(self):
        for terminal in self:
            if not terminal.adyen_terminal_identifier:
                continue
            # sudo() to search all companies
            existing_terminal = self.env['pos.payment.terminal'].sudo().search([
                ('id', '!=', terminal.id),
                ('adyen_terminal_identifier', '=', terminal.adyen_terminal_identifier),
            ], limit=1)
            if not existing_terminal:
                continue
            existing_payment_method = existing_terminal.payment_method_id
            if existing_payment_method.company_id == terminal.payment_method_id.company_id:
                raise ValidationError(self.env._(
                    'Terminal %(terminal)s is already used on payment method %(payment_method)s.',
                    terminal=terminal.adyen_terminal_identifier,
                    payment_method=existing_payment_method.display_name,
                ))
            raise ValidationError(self.env._(
                'Terminal %(terminal)s is already used in company %(company)s on payment method %(payment_method)s.',
                terminal=terminal.adyen_terminal_identifier,
                company=existing_payment_method.company_id.name,
                payment_method=existing_payment_method.display_name,
            ))
