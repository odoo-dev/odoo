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
import openerp.addons.decimal_precision as dp

class account_voucher(models.Model):
    _inherit = "account.voucher"

    @api.multi
    def voucher_move_line_create(self, line_total, move_id, company_currency, current_currency, context=None):
        import pudb; pu.db
        tot_line, rec_lst_ids = super(account_voucher, self).voucher_move_line_create(line_total, move_id, company_currency, current_currency)

        _negative_values = False
        for _lines in rec_lst_ids:
            _origin_move = _lines[1]
            if _origin_move.debit < 0.0 or _origin_move.credit < 0.0:
                _negative_values = True

        if _negative_values:
            for _lines in rec_lst_ids:
                _reconc_move = _lines[0]
                _origin_move = _lines[1]

                _credit = _reconc_move.credit
                _debit = _reconc_move.debit

                if _origin_move.credit and _origin_move.credit != 0.0:
                    if _origin_move.credit > 0.0:
                        _credit = abs(_reconc_move.credit + _reconc_move.debit) * -1
                        _debit = False
                    else:
                        _credit = abs(_reconc_move.credit + _reconc_move.debit)
                        _debit = False
                elif _origin_move.debit and _origin_move.debit != 0.0:
                    if _origin_move.debit > 0.0:
                        _debit = abs(_reconc_move.credit + _reconc_move.debit) * -1
                        _credit = False
                    else:
                        _debit = abs(_reconc_move.credit + _reconc_move.debit)
                        _credit = False

                _reconc_move.write({'debit': _debit, 'credit': _credit})

        return tot_line, rec_lst_ids
