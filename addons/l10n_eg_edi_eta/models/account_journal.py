from odoo import api, models, fields


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_eg_branch_id = fields.Many2one('res.partner', string='Branch', copy=False,
                                        help="Address of the subdivision of the company.  You can just put the "
                                             "company partner if this is used for the main branch.")
    l10n_eg_activity_type_id = fields.Many2one('l10n_eg_edi.activity.type', 'Activity Code', copy=False,
                                               help='This is the activity type of the branch according to Egyptian Tax Authority')
    l10n_eg_branch_identifier = fields.Char('Branch ID', copy=False,
                                            help="This number can be found on the taxpayer profile on the eInvoicing portal. ")

    @api.depends('type', 'company_id', 'company_id.country_code', 'company_id.l10n_eg_edi_api_mode')
    def _compute_show_fetch_in_einvoices_button(self):
        # EXTENDS 'account'
        super()._compute_show_fetch_in_einvoices_button()
        self.filtered(lambda j: j._l10n_eg_eta_can_fetch_bills()).show_fetch_in_einvoices_button = True

    def button_fetch_in_einvoices(self):
        # EXTENDS 'account'
        super().button_fetch_in_einvoices()
        eg_journals = self.filtered(lambda j: j._l10n_eg_eta_can_fetch_bills())
        for company in eg_journals.company_id:
            journal = eg_journals.filtered(lambda j: j.company_id == company)[:1]
            self.env['account.move'].with_company(company)._l10n_eg_eta_fetch_received_bills(journal)

    def _l10n_eg_eta_can_fetch_bills(self):
        self.ensure_one()
        return (
            self.type == 'purchase'
            and self.company_id.country_code == 'EG'
            and self.company_id.l10n_eg_edi_api_mode in ('preproduction', 'production')
        )
