from odoo import models


class IrUiView(models.Model):
    _inherit = 'ir.ui.view'

    _l10n_de__external_layout_din5008_optional = models.Ref('l10n_de.external_layout_din5008', required=False)
