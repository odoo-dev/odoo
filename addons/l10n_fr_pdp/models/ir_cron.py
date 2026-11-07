from odoo import models


class IrCron(models.Model):
    _inherit = 'ir.cron'

    _l10n_fr_pdp__ir_cron_pdp_get_regulatory_documents_optional = models.Ref('l10n_fr_pdp.ir_cron_pdp_get_regulatory_documents', 'ir.cron', required=False)
