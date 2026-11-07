# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, models


class OnboardingOnboardingStep(models.Model):
    _inherit = 'onboarding.onboarding.step'

    _account__onboarding_onboarding_step_base_document_layout = models.Ref(
        'account.onboarding_onboarding_step_base_document_layout', 'onboarding.onboarding.step', required=False)
    _account__init_accounts_tree = models.Ref('account.init_accounts_tree', 'ir.ui.view')
    _account__res_company_form_view_onboarding = models.Ref('account.res_company_form_view_onboarding', 'ir.ui.view')
    _account__res_company_form_view_onboarding_sale_tax = models.Ref('account.res_company_form_view_onboarding_sale_tax', 'ir.ui.view')
    _account__setup_financial_year_opening_form = models.Ref('account.setup_financial_year_opening_form', 'ir.ui.view')
    _account__view_account_search = models.Ref('account.view_account_search', 'ir.ui.view')
    _account__view_move_form = models.Ref('account.view_move_form', 'ir.ui.view')
    _web__view_base_document_layout = models.Ref('web.view_base_document_layout', 'ir.ui.view')

    # COMMON STEPS
    @api.model
    def action_open_step_company_data(self):
        """Set company's basic information."""
        company = self.env['account.journal'].browse(self.env.context.get('journal_id', None)).company_id or self.env.company
        action = {
            'type': 'ir.actions.act_window',
            'name': _('Set your company data'),
            'res_model': 'res.company',
            'res_id': company.id,
            'views': [(self._account__res_company_form_view_onboarding.id, "form")],
            'target': 'new',
        }
        return action

    @api.model
    def action_open_step_base_document_layout(self):
        view_id = self._web__view_base_document_layout.id
        return {
            'name': _('Configure your document layout'),
            'type': 'ir.actions.act_window',
            'res_model': 'base.document.layout',
            'target': 'new',
            'views': [(view_id, 'form')],
            'context': {"dialog_size": "extra-large"},
        }

    @api.model
    def action_validate_step_base_document_layout(self):
        """Set the onboarding(s) step as done only if layout is set."""
        if not self._account__onboarding_onboarding_step_base_document_layout or not self.env.company.external_report_layout_id:
            return False
        return self.action_validate_step('account.onboarding_onboarding_step_base_document_layout')

    # INVOICE ONBOARDING
    @api.model
    def action_open_step_bank_account(self):
        return self.env.company.setting_init_bank_account_action()

    @api.model
    def action_open_step_create_invoice(self):
        return {
            'type': 'ir.actions.act_window',
            'name': _('Create first invoice'),
            'views': [(self._account__view_move_form.id, 'form')],
            'res_model': 'account.move',
            'context': {'default_move_type': 'out_invoice'},
        }

    # DASHBOARD ONBOARDING
    @api.model
    def action_open_step_fiscal_year(self):
        company = self.env['account.journal'].browse(self.env.context.get('journal_id', None)).company_id or self.env.company
        view_id = self._account__setup_financial_year_opening_form.id

        return {
            'type': 'ir.actions.act_window',
            'name': _('Accounting Periods'),
            'view_mode': 'form',
            'res_model': 'account.financial.year.op',
            'target': 'new',
            'views': [[view_id, 'form']],
            'context': {
                'dialog_size': 'medium',
                'default_company_id': company.id,
            }
        }

    @api.model
    def action_open_step_chart_of_accounts(self):
        """ Called by the 'Chart of Accounts' button of the dashboard onboarding panel."""
        company = self.env['account.journal'].browse(self.env.context.get('journal_id', None)).company_id or self.env.company
        self.sudo().with_company(company).action_validate_step('account.onboarding_onboarding_step_chart_of_accounts')

        # If an opening move has already been posted, we open the list view showing all the accounts
        if company.opening_move_posted():
            return 'account.action_account_form'

        # Then, we open will open a custom list view allowing to edit opening balances of the account
        view_id = self._account__init_accounts_tree.id
        # Hide the current year earnings account as it is automatically computed
        domain = [
            *self.env['account.account']._check_company_domain(company),
            ('account_type', '!=', 'equity_unaffected'),
        ]
        return {
            'type': 'ir.actions.act_window',
            'name': _('Chart of Accounts'),
            'res_model': 'account.account',
            'view_mode': 'list',
            'limit': 99999999,
            'search_view_id': [self._account__view_account_search.id],
            'views': [[view_id, 'list'], [False, 'form']],
            'domain': domain,
        }

    # STEPS WITHOUT PANEL
    @api.model
    def action_open_step_sales_tax(self):
        view_id = self._account__res_company_form_view_onboarding_sale_tax.id

        return {
            'type': 'ir.actions.act_window',
            'name': _('Sales tax'),
            'res_id': self.env.company.id,
            'res_model': 'res.company',
            'target': 'new',
            'view_mode': 'form',
            'views': [[view_id, 'form']],
        }
