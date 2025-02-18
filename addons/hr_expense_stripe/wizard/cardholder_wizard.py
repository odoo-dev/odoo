import phonenumbers 
from datetime import date

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.addons.hr_expense_stripe.utils import make_request_stripe_proxy

class CardHolderWizard(models.TransientModel):
    _name = 'hr.expense.stripe.cardholder.wizard'
    _description = 'A wizard used to configure a cardholder'

    company_id = fields.Many2one(comodel_name='res.company', string="Company", readonly=True)
    employee_id = fields.Many2one(comodel_name='hr.employee', string="Employee", readonly=True)
    stripe_cardholder_id = fields.Char(string="Cardholder ID", related="employee_id.stripe_cardholder_id", readonly=True)
    company_country_id = fields.Many2one(comodel_name='res.country', related="company_id.country_id", string="Company Country", readonly=True)

    # Form Fields
    firstname = fields.Char(string="First Name")
    lastname = fields.Char(string="Last Name")

    email = fields.Char(string="Email")
    phone_number = fields.Char(string="Phone Number")
    birthday = fields.Date(string="Birthday")

    billing_address_city = fields.Char(string="City")
    billing_address_country = fields.Many2one(comodel_name="res.country", string="Country")
    billing_address_line1 = fields.Char(string="Street")
    billing_address_postal_code = fields.Char(string="Zip")

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)

        for wizard in res:
            if wizard.stripe_cardholder_id:
                payload = {'account': wizard.company_id.stripe_account_id}
                response = make_request_stripe_proxy(f'/api/stripe_issuing/1/cardholders/{wizard.stripe_cardholder_id}', payload, method='GET')
                wizard.firstname = response['individual']['first_name']
                wizard.lastname = response['individual']['last_name']

                wizard.email = response['email']
                wizard.phone_number = response['phone_number']

                year = response['individual']['dob']['year']
                month = response['individual']['dob']['month']
                day = response['individual']['dob']['day']
                wizard.birthday = date(year=year, month=month, day=day)

                wizard.billing_address_country = self.env['res.country'].search([('code', '=', response['billing']['address']['country'])], limit=1).id
                wizard.billing_address_city = response['billing']['address']['city']
                wizard.billing_address_line1 = response['billing']['address']['line1']
                wizard.billing_address_postal_code = response['billing']['address']['postal_code']
            else:
                # Try prefill from Employee
                private_first_name, *private_last_name = (wizard.employee_id.name or '').split(' ')
                wizard.firstname = private_first_name
                wizard.lastname = ' '.join(private_last_name)

                wizard.email = wizard.employee_id.email
                wizard.phone_number = wizard.employee_id.phone
                wizard.birthday = wizard.employee_id.birthday

                wizard.billing_address_country = wizard.employee_id.country_id
                wizard.billing_address_city = wizard.employee_id.private_city
                wizard.billing_address_line1 = wizard.employee_id.private_street
                wizard.billing_address_postal_code = wizard.employee_id.private_zip

        return res

    def action_save_cardholder(self):
        self.ensure_one()
        payload = {}
        try:
            payload= {
                'account': self.company_id.stripe_account_id,
                'billing': {
                    'address': {
                        'country': self.billing_address_country.code,
                        'city': self.billing_address_city,
                        'line1': self.billing_address_line1,
                        'postal_code': self.billing_address_postal_code,
                    }
                },
                'name': f'{self.firstname} {self.lastname}',
                'email': self.email,
                'phone_number': phonenumbers.format_number(phonenumbers.parse(self.phone_number), phonenumbers.PhoneNumberFormat.INTERNATIONAL),
                'individual': {
                    'dob': {
                        'day': self.birthday.day,
                        'year': self.birthday.year,
                        'month': self.birthday.month
                    },
                    'first_name': self.firstname,
                    'last_name': self.lastname,
                }
            }
        except phonenumbers.NumberParseException:
            raise ValidationError(_("Phone number is invalid"))

        if self.stripe_cardholder_id:
            success_message = _("The Cardholder had been successfully updated.")
            route = f'api/stripe_issuing/1/cardholders/{self.stripe_cardholder_id}'
            # TODO: lost phone_number must be updated differently using a 2fa from the cardholder new phone and 2fa from the admin phone
            del payload['phone_number']
            del payload['name']
        else:
            route = 'api/stripe_issuing/1/cardholders'
            success_message = _("The Cardholder had been successfully created.")

        response = make_request_stripe_proxy(route, payload)
        self.employee_id.stripe_cardholder_id = response['stripe_cardholder_ident']

        self.env.user._bus_send('simple_notification', {
            'type': 'success',
            'message': success_message,
        })

        return {
            'type': 'ir.actions.act_window_close'
        }
