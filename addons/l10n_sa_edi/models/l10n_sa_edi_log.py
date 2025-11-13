from odoo import fields, models


class L10nSaEdiLog(models.Model):
    _name = 'l10n_sa_edi.log'
    _order = 'create_date desc'

    l10n_sa_edi_document_id = fields.Many2one(comodel_name='l10n_sa_edi.document')
    state = fields.Selection([('to_send', 'To Send'), ('sent', 'Sent'), ('rejected', 'Rejected'), ('error', 'Error')])
    attachment_id = fields.Many2one(comodel_name='ir.attachment')
    res_model = fields.Selection([
        ('account.move', "Standard"),
        ('pos.order', "Simplified"),
    ])
    res_id = fields.Many2oneReference(model_field="res_model")
