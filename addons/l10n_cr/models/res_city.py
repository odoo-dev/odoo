# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResCity(models.Model):
    _inherit = 'res.city'

    l10n_cr_code = fields.Char(string='Cantón Code', help='Two-digit cantón code within its province.')
