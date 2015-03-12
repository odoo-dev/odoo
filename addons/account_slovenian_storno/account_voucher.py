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
    def voucher_move_line_create(self):
        import pudb; pu.db
        rec_lst_ids = super(account_voucher, self).voucher_move_line_create()

        negative_values = False
        for (x, y, line) in rec_lst_ids:
            if line['debit'] < 0.0 or line['credit'] < 0.0:
                negative_values = True

        if negative_values:
            for (x, y, line) in rec_lst_ids:

                credit = line['credit']
                debit = line['debit']

                if credit != 0.0:
                    if credit > 0.0:
                        credit = abs(credit + debit) * -1
                        debit = False
                    else:
                        credit = abs(credit + debit)
                        debit = False
                elif debit != 0.0:
                    if debit > 0.0:
                        debit = abs(credit + debit) * -1
                        credit = False
                    else:
                        debit = abs(credit + debit)
                        credit = False

                line.write({'debit': debit, 'credit': credit})

        return rec_lst_ids
