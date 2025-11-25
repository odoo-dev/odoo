# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrQwebFieldMany2one(models.AbstractModel):
    _name = 'ir.qweb.field.many2one'
    _description = 'Qweb Field Many to One'
    _inherit = ['ir.qweb.field.many2one']

    def _get_eval_context(self, record=None):
        ctx = super()._get_eval_context(record)
        ctx.update({
            'allowed_uom_ids': self.env.context.get('allowed_uom_ids', []),
        })
        return ctx
