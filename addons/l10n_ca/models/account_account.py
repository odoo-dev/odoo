# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models
from odoo.exceptions import ValidationError


class AccountAccount(models.Model):
    _inherit = 'account.account'

    @api.constrains('tag_ids', 'company_ids')
    def _check_l10n_ca_gifi_tag(self):
        invalid_accounts = self.filtered(lambda account: (
            'ca_2023' in account.company_ids.root_id.mapped('chart_template')
            and len(account.tag_ids.filtered('l10n_ca_gifi_code')) > 1
        ))
        if invalid_accounts:
            raise ValidationError(self.env._(
                "An account can't have more than one GIFI tag. Check the tags of the following accounts:\n%(accounts)s",
                accounts="\n".join(invalid_accounts.mapped('display_name')),
            ))
