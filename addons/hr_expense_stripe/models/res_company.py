import uuid

from odoo import _, api, models, fields
from odoo.addons.hr_expense_stripe.controllers.main import StripeIssuingController
from odoo.addons.hr_expense_stripe.utils import STRIPE_VALID_JOURNAL_CURRENCIES, make_request_stripe_proxy
from odoo.exceptions import UserError, ValidationError


class ResCompany(models.Model):
    _inherit = 'res.company'

    # Stripe account
    stripe_account_id = fields.Char(string='Stripe Account ID', copy=False)
    stripe_account_issuing_status = fields.Selection(
        selection=[
            ('restricted', "Restricted"),
            ('verified', "Verified"),
        ],
        string="Status",
        default='restricted'
    )

    stripe_journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='Stripe Issuing Journal',
        domain=[('type', '=', 'bank')],
        check_company=True,
        copy=False,
    )
    stripe_currency_id = fields.Many2one(
        comodel_name='res.currency',
        string='Stripe Currency',
        compute='_compute_stripe_currency',
        store=True,
        readonly=True,
        copy=False,
    )
    stripe_issuing_activated = fields.Boolean(groups='base.group_system')

    stripe_publishable_live_key = fields.Char(groups='base.group_system')
    stripe_publishable_test_key = fields.Char(groups='base.group_system')
    stripe_webhook_secret = fields.Char(groups='base.group_system')

    stripe_mode = fields.Selection(
        selection=[
            ('test', 'Test'),
            ('live', 'Live'),
        ],
        string="Stripe mode",
        default='live',
        groups='base.group_system',
    )

    def _get_stripe_webhook_url(self):
        self.ensure_one()
        return '/'.join((self.get_base_url(), StripeIssuingController._webhook_url, self.stripe_webhook_secret))

    @api.depends('country_id')
    def _compute_stripe_currency(self):
        for company in self:
            company_country = company.account_fiscal_country_id
            if self.env.ref('base.europe').id in set(company_country.country_group_ids.ids):
                company_currency_code = STRIPE_VALID_JOURNAL_CURRENCIES['EU']
            else:
                company_currency_code = STRIPE_VALID_JOURNAL_CURRENCIES.get((company_country.code or 'USD').upper())
            company.stripe_currency_id = self.env['res.currency'].search([('name', '=', company_currency_code)], limit=1).id

    def _connect_to_stripe(self):
        if not self.stripe_journal_id:
            raise UserError(_("Please select a bank journal to be connected to Stripe"))

    def _create_webhook_secret(self):
        """ Create a webhook secret and return a feedback notification.

        Note: This action only works for instances using a public URL

        :return: The feedback notification
        :rtype: dict
        """
        self.ensure_one()

        if self.stripe_webhook_secret:
            raise UserError(_("A Webhook URL already exists for this company."))

        self.stripe_webhook_secret = uuid.uuid4()

    def action_create_stripe_account(self):
        self.ensure_one()
        if self.stripe_account_id:
            raise UserError("User is already connected to stripe issuing.")
        self._create_webhook_secret()

        payload = {
            # IAP Data
            'webhook_url': self._get_stripe_webhook_url(),
            'country': self.country_id.code,
        }

        response = make_request_stripe_proxy('api/stripe_issuing/1/accounts', payload, method='POST')
        self.stripe_account_id = response['stripe_ident']

        # Now that we have created the account, we redirect the user to Stripe to let him configure it 
        payload = {
            'account': self.stripe_account_id,
            'refresh_url': self.get_base_url(),
            'return_url': self.get_base_url(),
        }
        response = make_request_stripe_proxy('api/stripe_issuing/1/account_links', payload, method='POST')
        return {
                'type': 'ir.actions.act_url',
                'url': response['onboarding_url'],
                'target': 'self',
            }

    def action_refresh_stripe_account(self):
        self.ensure_one()

        if not self.stripe_account_id:
            raise ValidationError(_("You need to be connected to stripe in order to refresh your account."))

        response = make_request_stripe_proxy(f'api/stripe_issuing/1/accounts/{self.stripe_account_id}', method='GET')
        self.stripe_account_issuing_status = 'verified' if response['capabilities']['card_issuing'] == 'active' else 'restricted' 

    def action_configure_stripe_account(self):
        self.ensure_one()

        if not self.stripe_account_id:
            raise ValidationError(_("You need to be connected to stripe in order to configure your account."))

        payload = {
            'account': self.stripe_account_id,
            'refresh_url': self.get_base_url(),
            'return_url': self.get_base_url(),
        }
        response = make_request_stripe_proxy('api/stripe_issuing/1/account_links', payload, method='POST')
        return {
            'type': 'ir.actions.act_url',
            'url': response['onboarding_url'],
            'target': 'self',
        }
