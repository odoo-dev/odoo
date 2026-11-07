# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _account__group_account_secured = models.Ref('account.group_account_secured', 'res.groups', required=False)

    @api.model
    def _activate_group_account_secured(self):
        group_account_secured = self._account__group_account_secured
        if not group_account_secured:
            return
        groups_with_access = [
            'account.group_account_readonly',
            'account.group_account_invoice',
        ]
        for group_name in groups_with_access:
            group = self.env.ref(group_name, raise_if_not_found=False)
            if group:
                group.sudo()._apply_group(group_account_secured)
