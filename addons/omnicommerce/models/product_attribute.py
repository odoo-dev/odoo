# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProductAttribute(models.Model):
    _inherit = "product.attribute"

    company_id = fields.Many2one(
        comodel_name="res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
