from odoo import fields, models


class L10nPtATSeries(models.Model):
    _inherit = "l10n_pt.at.series"

    document_type = fields.Selection(
        selection_add=[
            ('pos_order', 'PoS Order (VD)'),
            ('pos_refund', 'PoS Refund (NC)'),
        ],
        ondelete={'pos_order': 'cascade', 'pos_refund': 'cascade'},
    )
