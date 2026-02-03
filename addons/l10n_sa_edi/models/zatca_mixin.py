from odoo import api, fields, models


class ZatcaMixin(models.AbstractModel):
    """The point of this class is to hold common properties between models that should be sent to zatca"""

    _inherit = "zatca.mixin"

    l10n_sa_uuid = fields.Char(string='Document UUID (SA)', copy=False, help="Universally unique identifier of the Invoice")
    # todo: consider moving this to the document
    l10n_sa_invoice_signature = fields.Char("Unsigned XML Signature", copy=False)
    l10n_sa_edi_document_id = fields.Many2one(comodel_name="l10n_sa_edi.document", copy=False)
    l10n_sa_edi_state = fields.Selection(related="l10n_sa_edi_document_id.state")
    l10n_sa_edi_log_ids = fields.Many2many(comodel_name="l10n_sa_edi.log", compute="_compute_l10n_sa_edi_log_ids")
    l10n_sa_chain_index = fields.Integer(related="l10n_sa_edi_document_id.l10n_sa_chain_index")
    l10n_sa_edi_error_message = fields.Char(related="l10n_sa_edi_document_id.error_message")

    @api.depends()
    def _compute_l10n_sa_edi_log_ids(self):
        data = dict(self.env['l10n_sa_edi.log']._read_group([('res_id', 'in', self.ids), ('res_model', '=', self._name)],
                                                     groupby=['res_id'],
                                                     aggregates=['id:recordset']))

        for record in self:
            record.l10n_sa_edi_log_ids = data.get(record.id, self.env['l10n_sa_edi.log'])

    def _l10n_sa_get_adjustment_reason(self):
        self.ensure_one()
        readable_zatca_reason = dict(self._fields['l10n_sa_reason'].selection).get(self.l10n_sa_reason)
        return readable_zatca_reason if self.l10n_sa_show_reason else self.ref

    def _get_l10n_sa_qr_code_str(self):
        # todo: there could still be some phase 1 moves, call super on them, refer previous impl
        self.ensure_one()
        return self.l10n_sa_edi_document_id._get_phase_2_qr(self._l10n_sa_is_simplified())

    def _l10n_sa_get_payment_means_code(self):
        """
        Get ZATCA payment means code.

        This is a template method that should be overridden in implementing classes
        to provide specific payment means logic for invoices vs POS orders.

        :return: str - Payment means code key (cash/card/bank/transfer/unknown)
        """
        # Default implementation - should be overridden
        return 'unknown'
