from odoo import models


class IrModel(models.Model):
    _inherit = 'ir.model'

    _sale__model_sale_order = models.Ref('sale.model_sale_order', 'ir.model')
