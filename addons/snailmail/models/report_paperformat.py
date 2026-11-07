from odoo import models


class ReportPaperformat(models.Model):
    _inherit = 'report.paperformat'

    _l10n_de__paperformat_euro_din_optional = models.Ref('l10n_de.paperformat_euro_din', required=False)
