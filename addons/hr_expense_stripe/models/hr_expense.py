from odoo import api, fields, models
from odoo.exceptions import ValidationError

STRIPE_CURRENCY_MAPPING = {
    'usd': 'USD',
    'eur': 'EUR',
}

class HrExpense(models.Model):
    _name = 'hr.expense'
    _inherit = ['hr.expense', 'stripe.issuing']

    @api.model
    def _create_expense_from_stripe_issuing_authorization(self, issuing_auth_dict):
        expense_product_vals = {
            'name': issuing_auth_dict['merchant_data']['category'],
            'default_code': issuing_auth_dict['merchant_data']['category_code'],
            'can_be_expensed': True,
        }
        expense_product = self.env['product.product'].search(
            [(field_name, '=', field_value) for field_name, field_value in expense_product_vals.items()],
            limit=1,
        ) or self.env['product.product'].create(expense_product_vals)

        employee = self.env['hr.employee'].search([('stripe_id', '=', issuing_auth_dict['cardholder'])])
        if not employee:
            raise ValidationError("No corresponding employee found.")

        currency = self.env.ref(f"base.{STRIPE_CURRENCY_MAPPING[issuing_auth_dict['merchant_currency']]}")

        hr_expense_vals = {
            'product_id': expense_product.id,
            'stripe_id': issuing_auth_dict['id'],
            'payment_mode': 'company_account',
            'currency_id': currency.id,
            'total_amount_currency': issuing_auth_dict['merchant_amount'],
            'employee_id': employee.id,
        }

        return self.with_company(employee.company_id).create(hr_expense_vals)
