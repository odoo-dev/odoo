from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _l10n_es_tbai_get_substituted_docs(self):
        # EXTENDS 'l10n_es_edi_tbai'
        substituted_docs = super()._l10n_es_tbai_get_substituted_docs()
        for document in self.pos_order_ids._l10n_es_tbai_get_substituted_documents():
            serie, number = document._get_tbai_sequence_and_number()
            substituted_docs.append({
                'serie': serie,
                'number': number,
                # The date the ticket was declared with, read back from the XML that was
                # actually sent: it is not necessarily the date of the order.
                'date': document._get_tbai_signature_and_date()[1],
            })
        return substituted_docs
