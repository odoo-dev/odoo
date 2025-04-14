# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api


class ResCountryState(models.Model):
    _name = 'res.country.state'
    _inherit = ['res.country.state', 'pos.load.mixin']

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'code', 'country_id']
