from odoo import fields, models

from .l10n_sa_edi_document import L10N_SA_DOCUMENT_STATES


class L10nSaEdiLog(models.Model):
    _name = 'l10n_sa_edi.log'
    _order = 'create_date desc'
    _description = 'ZATCA Log'

    l10n_sa_edi_document_id = fields.Many2one(comodel_name='l10n_sa_edi.document')
    document_state = fields.Selection(related='l10n_sa_edi_document_id.state')
    state = fields.Selection(selection=L10N_SA_DOCUMENT_STATES)
    attachment_name = fields.Char()
    res_model = fields.Selection([
        ('account.move', "Standard"),
        ('pos.order', "Simplified"),
    ])
    res_id = fields.Many2oneReference(model_field="res_model")
    is_test = fields.Boolean()
    message = fields.Html()

    def action_retry(self):
        self.ensure_one()
        self.l10n_sa_edi_document_id._l10n_sa_post_zatca_edi(True)
