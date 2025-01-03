from odoo import Command, _, api, fields, models

SPENDING_POLICY_TRANSACTION_PERIODS = [
    ('daily', "Day"),
    ('weekly', "Week"),
    ('monthly', "Month"),
    ('yearly', "Year"),
    ('all_time', "All Time"),
]

# https://docs.stripe.com/api/issuing/cards/object#issuing_card_object-spending_controls-spending_limits
class HrExpenseStripeSpendingLimit(models.Model):
    _name = 'hr.expense.stripe.spending.limit'
    _description = 'Expense Stripe Spending Limit'
    _check_company_auto = True

    card_id = fields.Many2one(
        comodel_name='hr.expense.stripe.credit.card',
        string='Card',
        ondelete='cascade',
    )
    company_id = fields.Many2one(related='card_id.company_id')
    currency_id = fields.Many2one(related='card_id.currency_id')
    amount = fields.Monetary(string='Amount', required=True, currency_field='currency_id')
    interval = fields.Selection(
        string="Interval",
        selection=SPENDING_POLICY_TRANSACTION_PERIODS,
        required=True,
    )
    mcc_ids = fields.Many2many(comodel_name='product.mcc.stripe.tag', string='MCC Tags', required=True)

    @api.model
    def _create_vals_from_stripe(self, stripe_data):
        """ Create the card spending limits from stripe data """
        create_vals = []
        for spending_limit in stripe_data.get('spending_limits', []):
            create_vals.append({
                'amount': spending_limit['amount'],
                'interval': spending_limit['interval'],
                'mcc_ids': [Command.set(
                    self.env['product.mcc.stripe.tag'].search([('stripe_name', 'in', spending_limit.get('categories', []))]).ids
                )],
            })
        return create_vals
