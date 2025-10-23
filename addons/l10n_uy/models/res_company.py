# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _is_latam(self):
        return super()._is_latam() or self.country_code == 'UY'
