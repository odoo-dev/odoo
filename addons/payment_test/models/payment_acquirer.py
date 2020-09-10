# coding: utf-8
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class PaymentAcquirer(models.Model):
    _inherit = 'payment.acquirer'

    provider = fields.Selection(selection_add=[('test', 'Test')], ondelete={'test': 'set default'})

    @api.constrains('state', 'provider')
    def _check_acquirer_state(self):
        if self.filtered(lambda a: a.provider == 'test' and a.state not in ('test', 'disabled')):
            raise UserError(_("Test acquirers should never be enabled."))
