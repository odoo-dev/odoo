from odoo import models


class IrSequence(models.Model):
    _inherit = 'ir.sequence'

    _stock__sequence_production_lots = models.Ref('stock.sequence_production_lots', required=False)
