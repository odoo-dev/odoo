# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    report_rendering_engine = fields.Selection(
        related="company_id.report_rendering_engine",
        string="Report Rendering Engine",
        help="The report rendering engine used by the company to render reports.",
        readonly=False,
    )
