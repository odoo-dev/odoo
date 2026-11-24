# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import _, api, models
from odoo.exceptions import UserError


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ['qr_code_method']

    def l10n_id_qris_is_paid(self, trx_uuid, amount):
        """ Check, without calling the QRIS API, whether the latest QR code of the order is paid for this amount. """
        self.ensure_one()
        if self.payment_method_type != 'bank_qr_code' or self.qr_code_method != 'id_qr':
            return False
        trx = self.env['l10n_id.qris.transaction']._get_latest_transaction('pos.order', trx_uuid)
        return trx.paid and trx.qris_amount == int(amount)

    def l10n_id_verify_qris_status(self, trx_uuid):
        """ Verify qris payment status from the provided transaction UUID

        For all qris_invoice_details linked to the transaction, check the payment status
        """
        if self.payment_method_type != 'bank_qr_code' or self.qr_code_method != 'id_qr':
            return True
        trx = self.env['l10n_id.qris.transaction']._get_latest_transaction('pos.order', trx_uuid)
        if not trx:
            raise UserError(_("No QRIS transaction record is found based on this order"))
        if trx.paid:
            return True

        result = trx._l10n_id_get_qris_qr_statuses()
        return result['paid']
