# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

ODOO_PAYMENTS_DEPLOYED_COUNTRIES = [
    'BE', 'FR',
]

class ResCompany(models.Model):
    _inherit = 'res.company'

    payment_acquirer_onboarding_state = fields.Selection(
        string="State of the onboarding payment acquirer step",
        selection=[('not_done', "Not done"), ('just_done', "Just done"), ('done', "Done")],
        default='not_done')
    payment_onboarding_payment_method = fields.Selection(
        string="Selected onboarding payment method",
        selection=[
            ('paypal', "PayPal"),
            ('stripe', "Stripe"),
            ('odoo', "Credit & Debit Card with Odoo Payment"),
            ('manual', "Manual"),
        ])

    @api.model
    def is_odoo_payment_available(self):
        country = self.env.company.country_id
        return (country and country.code in ODOO_PAYMENTS_DEPLOYED_COUNTRIES)

    @api.model
    def action_open_payment_onboarding_payment_acquirer(self):
        """ Called by onboarding panel above the customer invoice list. """
        # Fail if there are no existing accounts
        self.env.company.get_chart_of_accounts_or_fail()

        action = self.env['ir.actions.actions']._for_xml_id(
            'payment.action_open_payment_onboarding_payment_acquirer_wizard'
        )
        return action

    def get_account_invoice_onboarding_steps_states_names(self):
        """ Override of account. """
        steps = super().get_account_invoice_onboarding_steps_states_names()
        return steps + ['payment_acquirer_onboarding_state']
