from odoo import api, fields, models


class ZatcaMixin(models.AbstractModel):
    """The point of this class is to hold common properties between models that should be sent to zatca"""

    _inherit = "zatca.mixin"

    l10n_sa_uuid = fields.Char(string='Document UUID (SA)', copy=False, help="Universally unique identifier of the Invoice")
    l10n_sa_invoice_signature = fields.Char("Unsigned XML Signature", copy=False)
    l10n_sa_edi_document_id = fields.Many2one(comodel_name="l10n_sa_edi.document", compute="_compute_l10n_sa_edi_document_id")
    l10n_sa_edi_state = fields.Selection(related="l10n_sa_edi_document_id.state")
    l10n_sa_edi_log_ids = fields.Many2many(comodel_name="l10n_sa_edi.log", compute="_compute_l10n_sa_edi_log_ids")
    l10n_sa_chain_index = fields.Integer(related="l10n_sa_edi_document_id.l10n_sa_chain_index", store=True)

    def _is_zatca_applicable(self):
        pass

    def _get_zatca_journal_id(self):
        pass

    def _create_l10n_sa_edi_document(self, **kwargs):
        self.env['l10n_sa_edi.document'].create({
            'res_id': self.id,
            'res_model': self._name,
            'state': 'to_send',
            'company_id': self.company_id,
            'journal_id': self._get_zatca_journal_id(),
            **kwargs,
        })

    def _compute_l10n_sa_edi_document_id(self):
        data = dict(self.env['l10n_sa_edi.document']._read_group([('res_id', 'in', self.ids), ('res_model', '=', self._name)],
                                                     groupby=['res_id'],
                                                     aggregates=['id:max']))

        for record in self:
            record.l10n_sa_edi_document_id = data.get(record.id)

    @api.depends()
    def _compute_l10n_sa_edi_log_ids(self):
        data = dict(self.env['l10n_sa_edi.log']._read_group([('res_id', 'in', self.ids), ('res_model', '=', self._name)],
                                                     groupby=['res_id'],
                                                     aggregates=['id:recordset']))

        for record in self:
            record.l10n_sa_edi_log_ids = data.get(record.id, self.env['l10n_sa_edi.log'])
