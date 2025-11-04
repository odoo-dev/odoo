from odoo import models
from odoo.fields import Domain


class AccountJournal(models.Model):
    _inherit = "account.journal"

    def open_myinvois_document(self):
        """
        Return an action to open the MyInvois Document matching this journal.
        """
        self.ensure_one()

        if self.type == 'sale':
            domain = Domain('move_type', 'in', ('out_invoice', 'out_refund', 'out_receipt', 'entry'))
        elif self.type == 'purchase':
            domain = Domain('move_type', 'in', ('in_invoice', 'in_refund', 'in_receipt', 'entry'))
        else:
            return None  # Should not happen

        domain &= Domain('journal_id', '=', self.id)

        return {
            'name': self.env._("MyInvois Documents"),
            'type': 'ir.actions.act_window',
            'res_model': 'myinvois.document',
            'view_mode': 'list,form',
            'views': [(self.env.ref('l10n_my_edi.myinvois_document_list_view').id, 'list'), (self.env.ref('l10n_my_edi.myinvois_document_form_view').id, 'form')],
            'domain': [('invoice_ids', 'any', domain)],
            'context': {
                'display_consolidate_invoice_button': True,
                'journal_id': self.id,
            }
        }
