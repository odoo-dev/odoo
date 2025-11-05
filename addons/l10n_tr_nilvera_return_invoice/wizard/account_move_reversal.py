from odoo import Command, api, fields, models


class AccountMoveReversal(models.TransientModel):
    _inherit = 'account.move.reversal'

    def _prepare_default_reversal(self, move):
        res = super()._prepare_default_reversal(move)
        lang = move.partner_id.lang or self.env.lang
        if self.country_code == 'TR':
            res.update(
                {
                    'ref': self.with_context(lang=lang).env._('%(move_name)s, %(move_date)s', move_name=move.name, move_date=move.invoice_date),
                    'l10n_tr_gib_invoice_scenario': 'TEMELFATURA',
                    'l10n_tr_gib_invoice_type': 'TEVKIFAT_İADE' if move.l10n_tr_gib_invoice_type == "TEVKIFAT" else "İADE",
                } 
            )
        return res
