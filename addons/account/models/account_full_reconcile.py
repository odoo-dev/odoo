# -*- coding: utf-8 -*-
from odoo import api, fields, models, Command
from odoo.tools import SQL


class AccountFullReconcile(models.Model):
    _name = 'account.full.reconcile'
    _description = "Full Reconcile"

    partial_reconcile_ids = fields.One2many('account.partial.reconcile', 'full_reconcile_id', string='Reconciliation Parts')
    reconciled_line_ids = fields.One2many('account.move.line', 'full_reconcile_id', string='Matched Journal Items')

    @api.model_create_multi
    def create(self, vals_list):
        def get_ids(commands):
            for command in commands:
                if command[0] == Command.LINK:
                    yield command[1]
                elif command[0] == Command.SET:
                    yield from command[2]
                else:
                    raise ValueError("Unexpected command: %s" % command)
        move_line_ids = [list(get_ids(vals.pop('reconciled_line_ids'))) for vals in vals_list]
        partial_ids = [list(get_ids(vals.pop('partial_reconcile_ids'))) for vals in vals_list]
        fulls = super().create(vals_list)

        self.env['account.move.line'].invalidate_model(['full_reconcile_id'])
        fulls.invalidate_recordset(['reconciled_line_ids'], flush=False)
        line_full_ids = []
        line_ids = []
        for full, ids in zip(fulls, move_line_ids):
            line_full_ids.extend([full.id] * len(ids))
            line_ids.extend(ids)
        if line_ids:
            self.env.cr.execute(SQL("""
                UPDATE account_move_line line
                   SET full_reconcile_id = source.full_id
                  FROM UNNEST(%s::integer[], %s::integer[]) AS source(full_id, line_id)
                 WHERE line.id = source.line_id
            """, line_full_ids, line_ids))

        self.env['account.partial.reconcile'].invalidate_model(['full_reconcile_id'])
        fulls.invalidate_recordset(['partial_reconcile_ids'], flush=False)
        partial_full_ids = []
        partial_line_ids = []
        for full, ids in zip(fulls, partial_ids):
            partial_full_ids.extend([full.id] * len(ids))
            partial_line_ids.extend(ids)
        if partial_line_ids:
            self.env.cr.execute(SQL("""
                UPDATE account_partial_reconcile partial
                   SET full_reconcile_id = source.full_id
                  FROM UNNEST(%s::integer[], %s::integer[]) AS source(full_id, partial_id)
                 WHERE partial.id = source.partial_id
            """, partial_full_ids, partial_line_ids))

        self.env['account.partial.reconcile']._update_matching_number(fulls.reconciled_line_ids)
        return fulls

    def unlink(self):
        # The default `ondelete='set null'` on `account_move_line.full_reconcile_id`
        # nulls the FK in PostgreSQL when the full reconcile is removed, but
        # `account_move_line.matching_number` is a plain Char that nobody
        # recomputes. Mirror the contract of `create()` (see the
        # `_update_matching_number` call right after the UPDATE above) on the
        # unlink path so each previously-linked line ends up with the correct
        # value (False, or 'P<n>' when partial reconciles survive as zombies).
        amls = self.reconciled_line_ids
        res = super().unlink()
        amls = amls.exists()
        if amls:
            self.env['account.partial.reconcile']._update_matching_number(amls)
        return res
