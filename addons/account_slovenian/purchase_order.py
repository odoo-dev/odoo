# -*- encoding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2004-TODAY OpenERP s.a. (<http://www.openerp.com>)
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


class purchase_order(models.Model):
    _name = 'purchase.order'
    _inherit = 'purchase.order'

    @api.model
    def _choose_account_from_po_line(self, order_line):
        account_id = super(purchase_order, self)._choose_account_from_po_line(order_line)

        if not order_line.order_id.company_id.slovenian_accounting:
            return account_id
        
        if order_line.product_id and not order_line.product_id.type == 'service':
            acc = order_line.product_id.property_stock_account_input
            if not acc:
                acc = order_line.product_id.categ_id.property_stock_account_input_categ
            if acc:
                fpos = order_line.order_id.fiscal_position
                account_id = fpos.map_account(acc)
        return account_id
