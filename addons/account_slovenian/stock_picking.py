# -*- encoding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2015-TODAY OpenERP s.a. (<http://www.openerp.com>)
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

from openerp import api, models

class stock_picking(models.Model):
    _inherit = "stock.picking"

    @api.multi
    def action_invoice_create(self, journal_id=False, group=False, type='out_invoice', context=None):
        import pudb; pu.db
        res = super(stock_picking,self).action_invoice_create(journal_id, group, type)
        if type == 'in_invoice' or type == 'in_refund':
            invs = self.env['account.invoice'].search([('id', 'in', res)])
            for inv in invs:
                for ol in inv.invoice_line:
                    if ol.product_id:
                        oa = ol.product_id.property_stock_account_input
                        if not oa:
                            oa = ol.product_id.categ_id.property_stock_account_input_categ
                        if oa and ol.invoice_id.fiscal_position:
                            fpos = ol.invoice_id.fiscal_position
                            a = fpos.map_account()
                            ol.write({'account_id': a})
        return res
