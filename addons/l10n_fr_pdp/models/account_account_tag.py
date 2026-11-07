from odoo import models


class AccountAccountTag(models.Model):
    _inherit = 'account.account.tag'

    _l10n_eu_oss__tag_oss_optional = models.Ref('l10n_eu_oss.tag_oss', required=False)
