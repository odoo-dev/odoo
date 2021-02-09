# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class IrAsset(models.Model):
    _inherit = 'ir.asset'

    website_id = fields.Many2one('website')

    def _get_asset_domain(self, bundle):
        asset_domain = super(IrAsset, self)._get_asset_domain(bundle)
        website = self.env['website'].get_current_website(fallback=False)
        if website:
            asset_domain += website.website_domain()
        return asset_domain

    def _get_addons_list(self):
        addons_list = super(IrAsset, self)._get_addons_list()
        website = self.env['website'].get_current_website(fallback=False)

        if not website:
            return addons_list

        IrModule = self.env['ir.module.module'].sudo()
        # discard all theme modules except website.theme_id
        themes = IrModule.search(IrModule.get_themes_domain()) - website.theme_id
        to_remove = set(themes.mapped('name'))

        return [name for name in addons_list if name not in to_remove]
