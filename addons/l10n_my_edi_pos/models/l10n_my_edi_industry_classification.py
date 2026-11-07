from odoo import models


class L10nMyEdiIndustryClassification(models.Model):
    _inherit = 'l10n_my_edi.industry_classification'

    _l10n_my_edi__class_00000 = models.Ref('l10n_my_edi.class_00000', 'l10n_my_edi.industry_classification', required=False)
