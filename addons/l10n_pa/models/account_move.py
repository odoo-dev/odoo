# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _get_l10n_latam_documents_domain(self):
        # EXTENDS 'l10n_latam_invoice_document'
        domain = super()._get_l10n_latam_documents_domain()
        if self.country_code == 'PA' and self.is_sale_document():
            # DGI: 02 documents an import, 04 and 05 reference an invoice
            excluded_codes = ['02'] if self.reversed_entry_id or self.debit_origin_id else ['02', '04', '05']
            domain.append(('code', 'not in', excluded_codes))
        return domain
