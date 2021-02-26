# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, fields, _


class CopyBOMOperations(models.TransientModel):
    _name = 'mrp.copy.bom.operations'
    _description = 'Copy Bill of Material Operations'

    bom_id = fields.Many2one('mrp.bom')
    operation_ids = fields.Many2many('mrp.routing.workcenter')

    @api.model
    def default_get(self, field_names):
        res = super().default_get(field_names)
        active_id = self.env.context.get('active_id')
        res['bom_id'] = active_id
        return res

    def action_copy_operations(self):
        for operation in self.operation_ids:
            operation.copy({'name': _("%s (copy)", operation.name), 'bom_id': self.bom_id.id})
