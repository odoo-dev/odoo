# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProductCategory(models.Model):
    _inherit = "product.category"

    company_id = fields.Many2one(
        comodel_name="res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
