# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class OnboardingOnboarding(models.Model):
    _inherit = 'onboarding.onboarding'

    _account__onboarding_onboarding_account_invoice = models.Ref('account.onboarding_onboarding_account_invoice', 'onboarding.onboarding', required=False)
    _account__onboarding_onboarding_step_create_invoice = models.Ref(
        'account.onboarding_onboarding_step_create_invoice', 'onboarding.onboarding.step', required=False)

    # Invoice Onboarding
    @api.model
    def action_close_panel_account_invoice(self):
        self.action_close_panel('account.onboarding_onboarding_account_invoice')

    def _prepare_rendering_values(self):
        """Compute existence of invoices for company."""
        self.ensure_one()
        if self == self._account__onboarding_onboarding_account_invoice:
            step = self._account__onboarding_onboarding_step_create_invoice
            if step.current_step_state == 'not_done':
                if self.env['account.move'].search_count(
                    [('company_id', '=', self.env.company.id), ('move_type', '=', 'out_invoice')], limit=1
                ):
                    step.action_set_just_done()
        return super()._prepare_rendering_values()

    # Dashboard Onboarding
    @api.model
    def action_close_panel_account_dashboard(self):
        self.action_close_panel('account.onboarding_onboarding_account_dashboard')
