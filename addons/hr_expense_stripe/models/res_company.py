from odoo import _, api, models, fields
from odoo.addons.hr_expense_stripe.controllers.main import StripeIssuingController
from odoo.addons.hr_expense_stripe.utils import API_VERSION, HANDLED_WEBHOOK_EVENTS, STRIPE_VALID_JOURNAL_CURRENCIES, stripe_make_request
from odoo.exceptions import UserError


class ResCompany(models.Model):
    _inherit = 'res.company'

    stripe_account_id = fields.Char(string='Stripe Account ID', copy=False)
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
    stripe_secret_live_key = fields.Char(groups='base.group_system')
    stripe_publishable_test_key = fields.Char(groups='base.group_system')
    stripe_secret_test_key = fields.Char(groups='base.group_system')

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
        return '/'.join((self.get_base_url(), StripeIssuingController._webhook_url))

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

    def _create_webhook(self):
        """ Create a webhook and return a feedback notification.

        Note: This action only works for instances using a public URL
        Note: Adapted copy of payment_stripe payment.provider.action_create_webhook

        :return: The feedback notification
        :rtype: dict
        """
        self.ensure_one()
        secret_key = self.stripe_secret_live_key if self.stripe_mode == 'live' else self.stripe_secret_test_key
        if self.stripe_webhook_secret:
            message = _("Your Stripe Webhook is already set up.")
            notification_type = 'warning'
        elif not secret_key:
            message = _("You cannot create a Stripe Webhook if your Stripe Secret Key is not set.")
            notification_type = 'danger'
        else:
            # 1. Get all existing webhooks
            existing_webhooks = stripe_make_request(secret_key, endpoint='webhook_endpoints', method='GET')

            # 2. Get the webhooks that would conflict with ours
            webhooks_to_delete = []
            for webhook in existing_webhooks.get('data', []):
                if any(event  in HANDLED_WEBHOOK_EVENTS for event in webhook.get('enabled_events', [])):
                    webhooks_to_delete.append(webhook.get('id'))

            # 3. Delete unwanted webhooks
            for webhook_id in webhooks_to_delete:
                stripe_make_request(secret_key, endpoint=f'webhook_endpoints/{webhook_id}', method='DELETE')

            # 4. Create the new webhook
            webhook = stripe_make_request(
                secret_key,
                endpoint='webhook_endpoints',
                payload={
                    'url': self._get_stripe_webhook_url(),
                    'enabled_events[]': HANDLED_WEBHOOK_EVENTS,
                    'api_version': API_VERSION,
                },
                method='POST',
            )
            self.stripe_webhook_secret = webhook.get('secret')
            message = _("You Stripe Webhook was successfully set up!")
            notification_type = 'info'

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': message,
                'sticky': False,
                'type': notification_type,
                'next': {'type': 'ir.actions.act_window_close'},  # Refresh the form to show the key
            }
        }
