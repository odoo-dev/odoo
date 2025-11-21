# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResCity(models.Model):
    _inherit = "res.city"

    # FIXME VFE unused field, can't we move it in a generic 'code' field ?
    l10n_pe_code = fields.Char('Code', help='This code will help with the '
                               'identification of each city in Peru.')
