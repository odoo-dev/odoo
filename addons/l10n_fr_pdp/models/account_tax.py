from odoo import models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    _l10n_eu_oss__tag_oss_optional = models.Ref('l10n_eu_oss.tag_oss', 'account.account.tag', required=False)

    def _l10n_fr_pdp_is_oss(self):
        """Return whether the tax was generated for the EU OSS scheme."""
        self.ensure_one()
        # l10n_eu_oss is optional: avoid introducing a stable dependency while
        # still recognizing the taxes it generates when it is installed.
        repartition_tags = (self.invoice_repartition_line_ids | self.refund_repartition_line_ids).tag_ids
        return self._l10n_eu_oss__tag_oss_optional in repartition_tags
