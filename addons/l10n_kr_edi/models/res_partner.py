# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_kr_representative_name = fields.Char(string="Representative Name")

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + [
            'l10n_kr_representative_name',
        ]
