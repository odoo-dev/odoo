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
    update_receiptbook_type(env)
    remove_base_vat_module(env)
    set_no_gap_to_documents_sequences(env)

    # we do this here because all our customers that has account_transfer
    # will have this module installed
    migrate_account_transfer_module(env)

    # al final lo hacemos en l10n_ar_account porque account_voucher se
    # actualiza después de este módulo y los pagos todavía no están registrados
    # migrate_voucher_data(env)


def set_no_gap_to_documents_sequences(env):
    # we set no_gap for all journal document sequence
    env['account.journal'].search(
        [('type', 'in', ['sale', 'purchase'])]).mapped(
        'journal_document_type_ids.sequence_id').write(
        {'implementation': 'no_gap'})


def remove_base_vat_module(env):
    # TODO mejorar, por alguna razon se desinstala y luego se vuelve a instalar
    domain = [('name', 'in', ['base_vat', 'l10n_ar_base_vat']),
              ('state', 'in', ('installed', 'to install', 'to upgrade'))]
    env['ir.module.module'].search(domain).module_uninstall()


def update_receiptbook_type(env):
    cr = env.cr
    openupgrade.map_values(
        cr,
        'type', 'partner_type',
        # openupgrade.get_legacy_name('type'), 'partner_type',
        [('receipt', 'customer'), ('payment', 'supplier')],
        table='account_payment_receiptbook', write='sql')


def install_original_modules(env):
    cr = env.cr
    openupgrade.logged_query(cr, """
        UPDATE ir_module_module
        SET state = 'to install'
        WHERE name in ('l10n_ar_account')
        -- habiamos agregado estos modulos para forzar instalacion pero de
        -- alguna manera openupgrade se da cuenta y los instala automaticamente
        -- hasta antes que instalar account_document. Sin importar si
        -- l10n_ar_partner_title estaba instalado o no (ahí si tendria sentido
        -- porque se hace el rename a l10n_ar_partner)
        -- WHERE name in ('l10n_ar_account', 'l10n_ar_partner',
        -- 'partner_identification', 'l10n_ar_states')
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


def migrate_account_transfer_module(env):
    if openupgrade.table_exists(env.cr, 'account_transfer'):
        migrate_transfer_account(env)
        migrate_transfers(env)


def migrate_transfer_account(env):
    cr = env.cr
    for company in env['res.company'].search([]):
        transfer_account = company.transfer_account_id
        if not transfer_account:
            continue
        current_assets = env.ref('account.data_account_type_current_assets')
        openupgrade.logged_query(cr, """
            UPDATE account_account
                set reconcile = True, user_type_id = %s
            WHERE id = %s
            """, (current_assets.id, transfer_account.id))
        # recompute amounts for lines of this account
        env['account.move.line'].search(
            [('account_id', '=', transfer_account.id)])._amount_residual()
        # reconcile unreconciled lines
        aml = env['account.move.line'].search([
            ('account_id', '=', transfer_account.id),
            ('reconciled', '=', False)])
        if aml:
            aml.reconcile()
            aml.compute_full_after_batch_reconcile()


def migrate_transfers(env):
    cr = env.cr
    openupgrade.logged_query(cr, """
        SELECT
            id,
            source_journal_id,
            target_journal_id,
            company_id,
            note,
            ref,
            date,
            source_move_id,
            target_move_id,
            amount,
            state
        FROM account_transfer
        """)
    for rec in cr.fetchall():
        (
            id,
            source_journal_id,
            target_journal_id,
            company_id,
            note,
            ref,
            date,
            source_move_id,
            target_move_id,
            amount,
            state) = rec

        if state == 'confirmed':
            state = 'posted'
        elif state == 'cancel':
            state = 'draft'

        payment_method = env['account.journal'].browse(
            source_journal_id).outbound_payment_method_ids
        payment = env['account.payment'].create({
            'payment_type': 'transfer',
            'payment_method_id': payment_method and payment_method[
                0].id or False,
            'amount': amount,
            'payment_date': date,
            'communication': ref,
            'journal_id': source_journal_id,
            'destination_journal_id': target_journal_id,
            'state': state,
            'name': 'Transferencia migrada desde id %s' % id,
        })
        env['account.move.line'].search([
            ('move_id', 'in', [source_move_id, target_move_id])]).write(
            {'payment_id': payment.id})
