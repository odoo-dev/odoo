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
    migrate_voucher_data(env)


def install_original_modules(env):
    cr = env.cr
    openupgrade.logged_query(cr, """
        UPDATE ir_module_module
        SET state = 'to install'
        WHERE name in ('l10n_ar_account', 'l10n_ar_partner')
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


def migrate_voucher_data(env):
    # migrate voucher data (usamos mismo whare que migrador)
    cr = env.cr
    query = (
        "SELECT id, receiptbook_id "
        "FROM account_voucher "
        "WHERE voucher_type IN ('receipt', 'payment') "
        "AND state in ('draft', 'posted')")
    # if table_exists(cr, 'account_voucher'):
    cr.execute(query)
    for id, receiptbook_id in cr.fetchall():
        env['account.payment'].browse(receiptbook_id).write({
            # 'manual_sufix': manual_sufix,
            # 'force_number': force_number,
            'receiptbook_id': receiptbook_id,
        })
