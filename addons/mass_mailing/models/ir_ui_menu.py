# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _load_menus_blacklist(self):
        # If user does not have basic mass mailing rights, do not load
        # 'Email Marketing > Campaigns' menu
        res = super()._load_menus_blacklist()
        if not self.env.user.has_group('mass_mailing.group_mass_mailing_user'):
            res.append(self.env.ref('mass_mailing.menu_email_campaigns').id)
        return res
