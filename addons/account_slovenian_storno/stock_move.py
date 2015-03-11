# -*- encoding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2004-TODAY OpenERP s.a. (<http://www.openerp.com>)
#    Copyright (C) 2013-TODAY Mentis d.o.o. (<http://www.mentis.si/openerp>)
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

from openerp import models, api

class stock_quant(models.Model):
    _inherit = "stock.quant"

    @api.model
    def _prepare_account_move_line(self, move, src_account_id, dest_account_id, reference_amount, reference_currency_id, context=None):
        import pudb; pu.db
        _move_lines = super(stock_quant, self)._prepare_account_move_line(move, src_account_id, dest_account_id, reference_amount, reference_currency_id, context)
        _old_debit_lines = _move_lines[0][2]
        _old_credit_lines = _move_lines[1][2]

        if (move.picking_id.type == 'in' and move.location_id.usage == 'customer') \
           or (move.picking_id.type == 'out' and move.location_dest_id.usage == 'supplier'):
            _new_debit_lines = _old_credit_lines.copy()
            _new_debit_lines['debit'] = _new_debit_lines['credit'] * -1
            _new_debit_lines['credit'] = 0.0

            _new_credit_lines = _old_debit_lines.copy()
            _new_credit_lines['credit'] = _new_credit_lines['debit'] * -1
            _new_credit_lines['debit'] = 0.0
        else:
            _new_debit_lines = _old_debit_lines
            _new_credit_lines = _old_credit_lines

        return [(0, 0, _new_debit_lines), (0, 0, _new_credit_lines)]
