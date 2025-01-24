from odoo import _, fields, models
from odoo.addons.hr_expense_stripe.utils import stripe_make_request
from odoo.exceptions import UserError, ValidationError


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    stripe_account_id = fields.Char(related='company_id.stripe_account_id')
    stripe_journal_id = fields.Many2one(
        comodel_name='account.journal',
        related='company_id.stripe_journal_id',
        readonly=False,
        check_company=True,
    )
    stripe_issuing_activated = fields.Boolean(
        related='company_id.stripe_issuing_activated',
        readonly=False,
    )

    stripe_publishable_live_key = fields.Char(
        related='company_id.stripe_publishable_live_key',
        readonly=False,
    )
    stripe_secret_live_key = fields.Char(
        related='company_id.stripe_secret_live_key',
        readonly=False,
    )
    stripe_publishable_test_key = fields.Char(
        related='company_id.stripe_publishable_test_key',
        readonly=False,
    )
    stripe_secret_test_key = fields.Char(
        related='company_id.stripe_secret_test_key',
        readonly=False,
    )

    stripe_mode = fields.Selection(
        related='company_id.stripe_mode',
        readonly=False,
    )

    def action_connect_to_stripe(self):
        self.company_id._connect_to_stripe()
        try:
            if self.company_id.stripe_mode == 'test':
                secret_key = self.company_id.stripe_secret_test_key
            else:
                secret_key = self.company_id.stripe_secret_live_key

            stripe_make_request(api_key=secret_key, endpoint='balance', method='GET')
            self.stripe_issuing_activated = True
            message = _("Connection to Stripe successful.")
            notification_type = 'info'

        except ValidationError as error:
            message = error.args[0]
            notification_type = 'error'

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

    def action_stripe_create_webhook(self):
        return self.company_id._create_webhook()
