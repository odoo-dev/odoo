# -*- coding: utf-8 -*-
##############################################################################
#
#    OpenUpgrade module for Odoo
#    @copyright 2015-Today: Odoo Community Association
#    @author: Stephane LE CORNEC
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

from openupgradelib import openupgrade


@openupgrade.migrate(use_env=True)
def migrate(env, version):
    install_original_modules(env)
    set_company_loc_ar(env)
    # al final lo hacemos en l10n_ar_account porque account_voucher se
    # actualiza después de este módulo y los pagos todavía no están registrados
    # migrate_voucher_data(env)


def install_original_modules(env):
    cr = env.cr
    openupgrade.logged_query(cr, """
        UPDATE ir_module_module
        SET state = 'to install'
        -- , 'l10n_ar_partner' (now installed automatically)
        WHERE name in ('l10n_ar_account')
        """)


def set_company_loc_ar(env):
    cr = env.cr
    openupgrade.map_values(
        cr,
        # openupgrade.get_legacy_name('type_tax_use'), 'localization',
        'use_argentinian_localization', 'localization',
        # [('all', 'none')],
        [(True, 'argentina')],
        table='res_company', write='sql')


# def migrate_voucher_data(env):
#     """
#     Para los vouchers existentes, traemos la data que falta
#     """
#     cr = env.cr
#     for payment in env['account.payment'].search([]):
#         openupgrade.logged_query(cr, """
#             SELECT receiptbook_id, document_number
#             FROM account_voucher
#             WHERE id = %s
#             """)
#         recs = cr.fetchall()
#         if recs:
#             receiptbook_id, document_number = recs[0]
#             payment.write({
#                 'receiptbook_id': receiptbook_id,
#                 'document_number': document_number,
#             })
