# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, models

class MarketplaceChannel(models.Model):
    _inherit = 'marketplace.channel'

    def open_marketplace_account_list(self):
        if self.code == 'shopee':
            return {
                'name': _("Shopee Accounts"),
                'type': 'ir.actions.act_window',
                'res_model': 'shopee.account',
                'view_mode': 'list,form',
            }
        return super().open_marketplace_account_list()
