from odoo import models


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    def l10n_tr_nilvera_get_documents(self):
        self.env['account.move']._l10n_tr_nilvera_get_documents()

    def l10n_tr_nilvera_get_message_status(self):
        """ Gets the status from Nilvera for all processing invoices in this journal. """
        invoices_to_update = self.env['account.move'].search([
            ('journal_id', '=', self.id),
            ('l10n_tr_nilvera_send_status', 'in', ['waiting', 'sent'])
        ])
        client = self.env.company._get_nilvera_client()
        invoices_to_update._l10n_tr_nilvera_get_submitted_document_status(client)
