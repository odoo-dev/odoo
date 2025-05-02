from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class PosOrder(models.Model):
    _inherit = 'l10n_es_edi_verifactu.document'

    pos_order_id = fields.Many2one(
        string="PoS Order",
        comodel_name='pos.order',
        readonly=True,
    )
