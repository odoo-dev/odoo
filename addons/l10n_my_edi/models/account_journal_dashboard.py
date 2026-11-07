from odoo import models


class AccountJournal(models.Model):
    _inherit = "account.journal"

    _l10n_my_edi__myinvois_document_form_view = models.Ref('l10n_my_edi.myinvois_document_form_view', 'ir.ui.view')
    _l10n_my_edi__myinvois_document_list_view = models.Ref('l10n_my_edi.myinvois_document_list_view', 'ir.ui.view')
    _l10n_my_edi__myinvois_document_search_view = models.Ref('l10n_my_edi.myinvois_document_search_view', 'ir.ui.view')

    def open_myinvois_document(self):
        """
        Return an action to open the MyInvois Document matching this journal.
        """
        self.ensure_one()
        return {
            'name': self.env._("MyInvois Documents"),
            'type': 'ir.actions.act_window',
            'res_model': 'myinvois.document',
            'view_mode': 'list,form',
            'search_view_id': [self._l10n_my_edi__myinvois_document_search_view.id, 'search'],
            'views': [(self._l10n_my_edi__myinvois_document_list_view.id, 'list'), (self._l10n_my_edi__myinvois_document_form_view.id, 'form')],
            'context': {
                'display_consolidate_invoice_button': True,
                'journal_id': self.id,
                'search_default_journal_id': self.id,
            }
        }
