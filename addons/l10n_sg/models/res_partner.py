# -*- coding: utf-8 -*-

from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _deduce_country_code(self):
        if (self.additional_identifiers or {}).get('SG_UEN'):
            return 'SG'
        return super()._deduce_country_code()
