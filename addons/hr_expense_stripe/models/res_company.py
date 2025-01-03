from odoo import _, api, models, fields
from odoo.addons.hr_expense_stripe.utils import STRIPE_VALID_JOURNAL_CURRENCIES
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

    @api.depends('country_id')
    def _compute_stripe_currency(self):
        for company in self:
            company_country = company.account_fiscal_country_id
            if self.env.ref('base.europe').id in set(company_country.country_group_ids.ids):
                company_currency_code = STRIPE_VALID_JOURNAL_CURRENCIES['EU']
            else:
                company_currency_code = STRIPE_VALID_JOURNAL_CURRENCIES.get(company_country.code.upper())
            company.stripe_currency_id = self.env['res.currency'].search([('name', '=', company_currency_code)], limit=1).id


    def _connect_to_stripe(self):
        if not self.stripe_journal_id:
            raise UserError(_("Please select a bank journal to be connected to Stripe"))
