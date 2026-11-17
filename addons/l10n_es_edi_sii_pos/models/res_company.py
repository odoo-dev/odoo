from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _l10n_es_pos_get_available_fiscal_modes(self):
        # EXTENDS 'l10n_es_edi_pos'
        # Same condition as the backend (`account.move._compute_l10n_es_edi_is_required`),
        # so the POS and the invoices always agree on whether SII is active.
        modes = super()._l10n_es_pos_get_available_fiscal_modes()
        if self.l10n_es_sii_tax_agency:
            modes.add('sii')
        return modes