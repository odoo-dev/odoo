from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class HrEmployee(models.Model):
    _name = 'hr.employee'
    _inherit = ['hr.employee', 'stripe.issuing']

    stripe_id = fields.Char(string='Stripe ID', readonly=True, copy=False, index='trigram', groups="hr.group_hr_user")
    private_first_name = fields.Char(string='First Name', compute='_compute_from_name', store=True, groups="hr.group_hr_user")
    private_last_name = fields.Char(string='Last Name', compute='_compute_from_name', store=True, groups="hr.group_hr_user")
    can_use_stripe_cards = fields.Boolean(string="Can use stripe credit cards", copy=False, index='btree_not_null', groups="hr.group_hr_user")
    stripe_credit_card_ids = fields.One2many(comodel_name='hr.expense.stripe.credit.card', inverse_name='cardholder_id', groups="hr.group_hr_user")

    _can_use_stripe_cards = models.Constraint(
        definition='CHECK(can_use_stripe_cards != TRUE OR (can_use_stripe_cards = TRUE AND user_id IS NOT NULL))',
        message="Only employee linked to a user can use stripe credit cards",
    )

    @api.depends('name')
    def _compute_from_name(self):
        for employee in self:
            private_first_name, *private_last_name = (employee.name or '').split(' ')
            if private_first_name and private_last_name:
                employee.private_first_name = private_first_name
                employee.private_last_name = ' '.join(private_last_name)

    @api.depends('can_use_stripe_cards')
    def _compute_requires_stripe_sync(self):
        for employee in self:
            employee.requires_stripe_sync = employee.company_id.stripe_issuing_activated and employee.can_use_stripe_cards

    @api.model
    def _stripe_get_endpoint(self, extra_url=''):
        # EXTENDS stripe.issuing
        if isinstance(extra_url, str):
            extra_url = [extra_url]
        return super()._stripe_get_endpoint(('cardholders', *extra_url))

    @api.model
    def _stripe_get_synchronized_fields(self):
        return {
            **super()._stripe_get_synchronized_fields(),
            'id': 'metadata[odoo_id]',
            'active': 'status',
            'mobile_phone': 'phone_number',
            'private_first_name': 'individual[first_name]',
            'private_last_name': 'individual[last_name]',
        }

    @api.model
    def _stripe_required_fields(self):
        return {
            **super()._stripe_required_fields(),
            'individual[first_name]': _("Cardholder's first name"),
            'individual[last_name]': _("Cardholder's last name"),
            'phone_number': _("A valid cardholder mobile phone number"),
            'billing[address][city]': _("Cardholder's private city"),
            'billing[address][country]': _("Cardholder's private country"),
            'billing[address][line1]': _("Cardholder's private street"),
            'billing[address][postal_code]': _("Cardholder's private zip"),
        }

    @api.model
    def _convert_stripe_data_to_odoo_vals(self, stripe_data):
        # EXTENDS stripe.issuing
        res = super()._convert_stripe_data_to_odoo_vals(stripe_data)
        if not res or stripe_data['type'] != 'individual':
            return {}
        name = ' '.join(
            part
            for part in (stripe_data['individual'].get('first_name'), stripe_data['individual'].get('last_name'))
            if part
        )
        country = self.env['res.country'].search([('code', '=ilike', stripe_data['billing']['address']['country'])], limit=1)
        state = self.env['res.country.state'].search([('name', '=ilike', stripe_data['billing']['address']['state'])], limit=1)
        return res.update({
            'name': name or stripe_data['name'],
            'work_email': stripe_data['email'],
            'mobile_phone': stripe_data['phone_number'],
            'private_first_name': stripe_data['individual']['first_name'],
            'private_last_name': stripe_data['individual']['last_name'],
            'private_street': stripe_data['billing']['address']['line1'],
            'private_street2': stripe_data['billing']['address']['line2'],
            'private_city': stripe_data['billing']['address']['city'],
            'private_zip': stripe_data['billing']['address']['postal_code'],
            'private_country_id': country and country.id,
            'private_state_id': state and state.id,
        })

    def _create_from_stripe(self, vals):
        # OVERRIDDE stripe.issuing
        # Doesn't create a record from stripe but tries to match it without the stripe_id
        cardholder_ids = []
        for record_data in vals:
            if record_data['livemode'] != (self._get_stripe_mode() == 'live'):
                raise ValidationError(_(
                    "The stripe data received is not in the same mode as the company. Are you sending test data to a live company?"
                ))
            stripe_id = record_data['stripe_id']
            cardholder = self.env['hr.employee'].search(
                ['|', ('stripe_id', '=', stripe_id), '&', ('stripe_id', '=', False), ('email', '=', record_data['email'])],
                limit=1,
            )
            if not cardholder:
                continue
            if cardholder:
                cardholder_ids.append(cardholder.id)
                new_vals = {'stripe_id': stripe_id, 'can_use_stripe_cards': True}
                if not cardholder.mobile_phone:
                    new_vals['mobile_phone'] = record_data['phone_number']
                cardholder.write(new_vals)
        return self.env['hr.employee'].browse(cardholder_ids)

    def _stripe_build_object(self, create=False):
        # EXTENDS stripe.issuing
        stripe_object = super()._stripe_build_object()
        if create:
            stripe_object.update(
                {'name': self.name}
            )
        # We hope the phone number is in international form if it isn't the company country
        stripe_object.update({
            'phone_number': self._phone_format(fname='mobile_phone', country=self.country_id, force_format='E164'),
            'email': self.work_email or self.email,
            'billing[address][line1]': self.private_street,
            'billing[address][line2]': self.private_street2,
            'billing[address][city]': self.private_city,
            'billing[address][postal_code]': self.private_zip,
            'billing[address][country]': self.private_country_id.code,
            'billing[address][state]': self.private_state_id.code,
            'individual[first_name]': self.private_first_name,
            'individual[last_name]': self.private_last_name,
            'status': 'active' if self.active else 'inactive',
            'metadata[odoo_id]': self.id,
        })

        stripe_object = {key: value for key, value in stripe_object.items() if value not in {False, None}}
        create_required_fields = {'name': _("Cardholder name")} if create else False
        self._validate_stripe_object_requirements(stripe_object, create_fields=create_required_fields)
        return stripe_object

    def _stripe_search_filters(self):
        # EXTENDS stripe.issuing
        return {
            **super()._stripe_search_filters(),
            'email': self.work_email or self.email,
            'phone_number': self._phone_format('mobile_phone', country=self.country_id, force_format='E164'),
        }

    def action_create_stripe_credit_card(self):
        for company, employees in self.grouped('company_id').items():
            if not company.stripe_journal_id:
                raise UserError(_("Company %(name)s must have a stripe journal setup"))
            employee_not_on_stripe = employees.filtered(lambda employee: not employee.stripe_id)
            employee_not_on_stripe.can_use_stripe_cards = True
            employee_not_on_stripe._stripe_send_data()
            create_vals = []
            for employee in employees:
                create_vals.append({'cardholder_id': employee.id, 'company_id': company.id})
            if create_vals:
                self.env['hr.expense.stripe.credit.card'].with_company(company).create(create_vals)
