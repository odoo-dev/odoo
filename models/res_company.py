##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    localization = fields.Selection(
        [('generic', 'Generic')],
        'Localization',
    )
