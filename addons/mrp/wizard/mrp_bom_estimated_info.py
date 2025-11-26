from odoo import fields, models


class MrpBomEstimatedInfo(models.TransientModel):
    _name = 'mrp.bom.estimated.info'
    _description = 'Bill of Material Estimated Info'

    bom_id = fields.Many2one('mrp.bom', string="Bill of Material", required=True)
    estimated_info = fields.Text("Manufacturing Readiness Details")
