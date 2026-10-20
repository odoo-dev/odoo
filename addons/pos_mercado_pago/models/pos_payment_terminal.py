# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    mp_id_point_smart = fields.Char(
        string="Terminal S/N",
        help="Enter your Point Smart terminal serial number written on the back of your terminal (after the S/N:)")
    mp_id_point_smart_complet = fields.Char(copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        terminals = super().create(vals_list)
        terminals._mp_find_point_smart()
        return terminals

    def write(self, vals):
        res = super().write(vals)
        if 'mp_id_point_smart' in vals:
            self._mp_find_point_smart()
        return res

    def _mp_find_point_smart(self):
        """ Set the Mercado Pago id of the Point Smart terminals, found from their serial number. """
        for terminal in self.filtered(lambda t: t.payment_method_id.payment_provider == 'mercado_pago'):
            payment_method_sudo = terminal.payment_method_id.sudo()
            if payment_method_sudo.mp_bearer_token and terminal.mp_id_point_smart:
                terminal.mp_id_point_smart_complet = payment_method_sudo._find_terminal(
                    payment_method_sudo.mp_bearer_token, terminal.mp_id_point_smart,
                )
