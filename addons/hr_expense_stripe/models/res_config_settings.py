from odoo import _, fields, models
from odoo.exceptions import UserError


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
        self.env['stripe.issuing']._stripe_make_request(endpoint='balance', method='GET')
        self.env['stripe.issuing']._stripe_make_request(endpoint='balance', method='GET')

        self.company_id.stripe_issuing_activated = True

    def action_import_from_stripe(self):
        if not self.stripe_issuing_activated:
            raise UserError(_("Stripe issuing is not connected."))
        for model, check_active in (('hr.employee', True), ('hr.expense.stripe.credit.card', False)):
            self.env[model].with_context(stripe_check_active=check_active)._fetch_stripe()
