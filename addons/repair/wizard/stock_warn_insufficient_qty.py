# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockWarnInsufficientQtyRepair(models.TransientModel):
    _name = 'stock.warn.insufficient.qty.repair'
    _inherit = 'stock.warn.insufficient.qty'
    _description = 'Warn Insufficient Repair Quantity'

    repair_id = fields.Many2one('repair.order', string='Repair')

    def _get_reference_document_company_id(self):
        return self.repair_id.company_id

    def _get_reference_company_id(self):
        company = self.env['stock.scrap'].browse(self._context.get('default_repair_id')).company_id
        return company

    def action_done(self):
        self.ensure_one()
        return self.repair_id._action_repair_confirm()
