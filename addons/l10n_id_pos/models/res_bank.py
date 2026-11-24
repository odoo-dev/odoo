# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class ResPartnerBank(models.Model):
    _inherit = "res.partner.bank"

    def _l10n_id_qris_process_webhook(self, data):
        # EXTENDS l10n_id
        super()._l10n_id_qris_process_webhook(data)
        transaction = self.env['l10n_id.qris.transaction'].search([
            ('bank_id', '=', self.id),
            ('qris_invoice_id', '=', data.get('invoice')),
            ('model', '=', 'pos.order'),
            ('paid', '=', True),
        ], limit=1)
        if not transaction:
            return

        # Notify the open PoS using this bank account that the order is paid
        payment_methods = self.env['pos.payment.method'].search([
            ('payment_method_type', '=', 'bank_qr_code'),
            ('qr_code_method', '=', 'id_qr'),
            ('journal_id.bank_account_id', '=', self.id),
        ])
        for config in payment_methods.config_ids.filtered('current_session_id'):
            config._notify('L10N_ID_QRIS_PAID', {'uuid': transaction.model_id})
