import logging

from odoo import models

_logger = logging.getLogger(__name__)

# Payments, then invoices, then orders; journals and their accounts last.
CLEANUP_RANKS = {
    'account.payment': 10,
    'account.move': 20,
    'sale.order': 30,
    'account.journal': 80,
    'account.account': 90,
}


class LearningPracticeRecord(models.Model):
    _inherit = 'learning.practice.record'

    def _cleanup_rank(self, res_model):
        return CLEANUP_RANKS.get(res_model) or super()._cleanup_rank(res_model)

    def _cleanup(self):
        """Confirmed orders, posted invoices and payments cannot be deleted as
        they are: bring them back to draft first. They all live in practice
        journals, so this never touches real accounting."""
        def practice(model):
            ids = self.filtered(lambda entry: entry.res_model == model).mapped('res_id')
            return self.env[model].sudo().browse(ids).exists()

        payments = practice('account.payment')
        moves = practice('account.move') | payments.move_id
        orders = practice('sale.order')
        for undo in (
            lambda: payments.filtered(lambda payment: payment.state != 'draft').action_draft(),
            lambda: moves.filtered(lambda move: move.state == 'posted').button_draft(),
            lambda: orders.filtered(lambda order: order.state == 'sale')._action_cancel(),
        ):
            try:
                with self.env.cr.savepoint():
                    undo()
            except Exception:  # noqa: BLE001 - cleanup goes on; what remains is archived or logged
                _logger.warning("Could not bring practice sales documents back to draft", exc_info=True)
        return super(LearningPracticeRecord, self.with_context(force_delete=True))._cleanup()
