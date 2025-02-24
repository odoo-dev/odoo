from odoo import _, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    stripe_id = fields.Char(related='company_id.stripe_id')
    stripe_account_issuing_status = fields.Selection(related="company_id.stripe_account_issuing_status", readonly=True)
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
    stripe_publishable_test_key = fields.Char(
        related='company_id.stripe_publishable_test_key',
        readonly=False,
    )
    stripe_mode = fields.Selection(
        related='company_id.stripe_mode',
        readonly=False,
    )

    def action_create_stripe_account(self):
        return self.company_id.action_create_stripe_account()

    def action_refresh_stripe_account(self):
        return self.company_id.action_refresh_stripe_account()

    def action_configure_stripe_account(self):
        return self.company_id.action_configure_stripe_account()
