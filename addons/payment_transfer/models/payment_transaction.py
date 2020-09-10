# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, api, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_transfer.controllers.main import TransferController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _get_specific_rendering_values(self, processing_values):
        if self.provider != 'transfer':
            return super()._get_specific_rendering_values(processing_values)

        return {
            'tx_url': TransferController._accept_url,
            **processing_values,
        }

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'transfer':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('reference')
        tx = self.search([
           ('reference', '=', reference),
           ('acquirer_id.provider', '=', provider),
        ])
        if not tx:
            raise ValidationError("Wire Transfer: " + _(
                "no matching transaction found for reference %s", reference
            ))
        return tx

    def _process_feedback_data(self, data):
        if self.provider != 'transfer':
            return super()._process_feedback_data(data)

        _logger.info(
            f"validated transfer payment for tx with reference {self.reference}: set as pending"
        )
        self._set_pending()

    def _get_sent_message(self):
        if self.provider == 'transfer':
            self.ensure_one()
            return _(
                "The customer has selected %(acq_name)s to make the payment.",
                acq_name=self.acquirer_id.name
            )

        return super()._get_sent_message()

    def _log_received_message(self):
        other_provider_txs = self.filtered(lambda t: t.provider != 'transfer')
        super(PaymentTransaction, other_provider_txs)._log_received_message()
