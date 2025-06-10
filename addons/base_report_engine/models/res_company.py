# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields

class ResCompany(models.Model):
    _inherit = 'res.company'

    report_rendering_engine = fields.Selection(
        selection=[
            ('qweb-pdf-none', 'No Rendering Engine (Client Browser)'),
        ],
        string='Default Report Rendering Engine',
        default='qweb-pdf-none',
        help="The company's default rendering engine used for reports."
            " This can be overridden on each report.",
        required=True,
    )
