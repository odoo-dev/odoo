# -*- coding: utf-8 -*-

from openerp import models, fields, api, _

class account_payment(models.Model):
    _inherit = "account.payment"

    @api.one
    @api.depends('payment_method')
    def _compute_sepa_payment_method_selected(self):
        self.sepa_payment_method_selected = self.payment_method.code == 'sepa_ct'

    sepa_payment_method_selected = fields.Boolean(compute='_compute_sepa_payment_method_selected')
    sepa_communication = fields.Char(string="Communication", size=140)

    @api.onchange('invoice_id')
    def _onchange_invoice(self):
        super(account_payment, self)._onchange_invoice()
        if self.invoice_id:
            self.sepa_communication = self.invoice_id.reference
