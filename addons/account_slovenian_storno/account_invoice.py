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


class account_invoice(models.Model):
    _inherit = "account.invoice"

    @api.multi
    def finalize_invoice_move_lines(self, move_lines):
        move_lines = super(account_invoice, self).finalize_invoice_move_lines(move_lines)

        if self.type in ('in_refund', 'out_refund'):
            _move_lines = []
            for line in move_lines:
                if line[2]['credit'] and line[2]['credit'] != 0.0:
                    _debit = line[2]['credit'] * -1
                    _credit = False
                else:
                    _credit = line[2]['debit'] * -1
                    _debit = False
                line[2]['credit'] = _credit
                line[2]['debit'] = _debit
                _move_lines.append(line)
            return _move_lines
        else:
            return move_lines
