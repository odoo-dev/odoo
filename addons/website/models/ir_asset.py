# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from logging import getLogger
from odoo import fields, models

_logger = getLogger(__name__)


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
        if website:
            theme_category = self.env['ir.module.category'].sudo().search([('name', '=', 'Theme')])
            names_to_remove = [mod.name
                for mod in self.env['ir.module.module'].search([('category_id', 'child_of', theme_category.id)])
                if not website.theme_id or website.theme_id != mod
            ]
            addons_list = [addon
                for addon in addons_list
                if addon not in names_to_remove
            ]
        return addons_list
