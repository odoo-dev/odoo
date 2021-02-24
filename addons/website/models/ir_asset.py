# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from logging import getLogger
from odoo import fields, models

_logger = getLogger(__name__)

excluded_theme_category_ids = [
    'base.module_category_hidden',
    'base.module_category_theme_hidden',
]
theme_category_id = 'base.module_category_theme'

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
            def get_id(view_id):
                view = self.env.ref(view_id, False)
                return view.id if view else False
            all_themes = self.env['ir.module.module'].sudo().search([
                ('category_id', 'not in', [get_id(id) for id in excluded_theme_category_ids]),
                '|',
                ('category_id', '=', get_id(theme_category_id)),
                ('category_id.parent_id', '=', get_id(theme_category_id))
            ])
            uninstalled_theme_names = [theme.name
                for theme in all_themes
                if not website.theme_id or website.theme_id != theme
            ]
            addons_list = [addon
                for addon in addons_list
                if addon not in uninstalled_theme_names
            ]
        return addons_list
