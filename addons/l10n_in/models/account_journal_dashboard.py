from odoo import models


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    def _fill_general_dashboard_data(self, dashboard_data):
        super()._fill_general_dashboard_data(dashboard_data)

        for journal in self.filtered(lambda j: j.type == 'general'):
            is_return_journal = journal == journal.company_id.account_tax_return_journal_id
            if is_return_journal and journal.country_code == 'IN':
                dashboard_data[journal.id]['to_hide_tax_return_button'] = True
