# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from logging import getLogger
from odoo import api, fields, models

_logger = getLogger(__name__)


class IrAsset(models.Model):

    _inherit = 'ir.asset'

    website_id = fields.Many2one('website')

    @api.model
    def create(self, vals):
        website = self.env['website'].get_current_website(fallback=False)
        if website and 'website_id' not in vals and 'not_force_website_id' not in self.env.context:
            vals['website_id'] = website.id
        return super(IrAsset, self).create(vals)

    def _get_asset_domain(self, bundle):
        domain = super(IrAsset, self)._get_asset_domain(bundle)
        website = self.env['website'].get_current_website(fallback=False)
        if website:
            domain += [('website_id', 'in', (website.id, False))]
        return domain
