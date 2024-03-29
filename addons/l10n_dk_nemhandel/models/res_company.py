# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
from stdnum import get_cc_module, ean

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.addons.account.models.company import PEPPOL_LIST

try:
    import phonenumbers
except ImportError:
    phonenumbers = None


class ResCompany(models.Model):
    _inherit = 'res.company'


    l10n_dk_nemhandel_contact_email = fields.Char(
        string='Contact email',
        compute='_compute_l10n_dk_nemhandel_contact_email', store=True, readonly=False,
        help='Primary contact email for Nemhandel-related communication',
    )
    l10n_dk_nemhandel_phone_number = fields.Char(
        string='Phone number (for validation)',
        compute='_compute_l10n_dk_nemhandel_phone_number', store=True, readonly=False,
        help='You will receive a verification code to this phone number',
    )
    l10n_dk_nemhandel_proxy_state = fields.Selection(
        selection=[
            ('not_registered', 'Not registered'),
            ('not_verified', 'Not verified'),
            ('sent_verification', 'Verification code sent'),
            ('pending', 'Pending'),
            ('active', 'Active'),
            ('rejected', 'Rejected'),
            ('canceled', 'Canceled'),
        ],
        string='Nemhandel status', required=True, default='not_registered',
    )
    l10n_dk_nemhandel_identifier_type = fields.Selection(related='partner_id.l10n_dk_nemhandel_identifier_type', readonly=False)
    l10n_dk_nemhandel_identifier_value = fields.Char(related='partner_id.l10n_dk_nemhandel_identifier_value', readonly=False)
    l10n_dk_nemhandel_purchase_journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='Denmark EDI Purchase Journal',
        domain=[('type', '=', 'purchase')],
        compute='_compute_l10n_dk_nemhandel_purchase_journal_id', store=True, readonly=False,
        inverse='_inverse_l10n_dk_nemhandel_purchase_journal_id',
    )

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _sanitize_l10n_dk_nemhandel_phone_number(self, phone_number=None):
        self.ensure_one()

        error_message = _(
            "Please enter the phone number in the correct international format.\n"
            "For example: +32123456789, where +32 is the country code.\n"
            "Currently, only European countries are supported.")

        if not phonenumbers:
            raise ValidationError(_("Please install the phonenumbers library."))

        phone_number = phone_number or self.l10n_dk_nemhandel_phone_number
        if not phone_number:
            return

        if not phone_number.startswith('+'):
            phone_number = f'+{phone_number}'

        try:
            phone_nbr = phonenumbers.parse(phone_number)
        except phonenumbers.phonenumberutil.NumberParseException:
            raise ValidationError(error_message)

        country_code = phonenumbers.phonenumberutil.region_code_for_number(phone_nbr)
        if country_code not in PEPPOL_LIST or not phonenumbers.is_valid_number(phone_nbr):
            raise ValidationError(error_message)

    # -------------------------------------------------------------------------
    # CONSTRAINTS
    # -------------------------------------------------------------------------

    @api.constrains('l10n_dk_nemhandel_phone_number')
    def _check_l10n_dk_nemhandel_phone_number(self):
        for company in self:
            if company.l10n_dk_nemhandel_phone_number:
                company._sanitize_l10n_dk_nemhandel_phone_number()

    @api.constrains('l10n_dk_nemhandel_purchase_journal_id')
    def _check_l10n_dk_nemhandel_purchase_journal_id(self):
        for company in self:
            if company.l10n_dk_nemhandel_purchase_journal_id and company.l10n_dk_nemhandel_purchase_journal_id.type != 'purchase':
                raise ValidationError(_("A purchase journal must be used to receive Nemhandel documents."))

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    @api.depends('l10n_dk_nemhandel_proxy_state')
    def _compute_l10n_dk_nemhandel_purchase_journal_id(self):
        for company in self:
            if not company.l10n_dk_nemhandel_purchase_journal_id and company.l10n_dk_nemhandel_proxy_state not in ('not_registered', 'rejected'):
                company.l10n_dk_nemhandel_purchase_journal_id = self.env['account.journal'].search([
                    *self.env['account.journal']._check_company_domain(company),
                    ('type', '=', 'purchase'),
                ], limit=1)
                company.l10n_dk_nemhandel_purchase_journal_id.is_l10n_dk_nemhandel_journal = True
            else:
                company.l10n_dk_nemhandel_purchase_journal_id = company.l10n_dk_nemhandel_purchase_journal_id

    def _inverse_l10n_dk_nemhandel_purchase_journal_id(self):
        for company in self:
            # This avoid having 2 or more journals from the same company with
            # `is_l10n_dk_nemhandel_journal` set to True (which could occur after changes).
            journals_to_reset = self.env['account.journal'].search([
                ('company_id', '=', company.id),
                ('is_l10n_dk_nemhandel_journal', '=', True),
            ])
            journals_to_reset.is_l10n_dk_nemhandel_journal = False
            company.l10n_dk_nemhandel_purchase_journal_id.is_l10n_dk_nemhandel_journal = True

    @api.depends('email')
    def _compute_l10n_dk_nemhandel_contact_email(self):
        for company in self:
            if not company.l10n_dk_nemhandel_contact_email:
                company.l10n_dk_nemhandel_contact_email = company.email

    @api.depends('phone')
    def _compute_l10n_dk_nemhandel_phone_number(self):
        for company in self:
            if not company.l10n_dk_nemhandel_phone_number:
                try:
                    # precompute only if it's a valid phone number
                    company._sanitize_l10n_dk_nemhandel_phone_number(company.phone)
                    company.l10n_dk_nemhandel_phone_number = company.phone
                except ValidationError:
                    continue

    # -------------------------------------------------------------------------
    # LOW-LEVEL METHODS
    # -------------------------------------------------------------------------

    @api.model
    def _sanitize_l10n_dk_nemhandel_endpoint(self, vals, type=False, value=False):
        # TODO sanitize value
        if 'l10n_dk_nemhandel_identifier_type' not in vals and 'l10n_dk_nemhandel_identifier_value' not in vals:
            return vals

        identifier_type = vals['l10n_dk_nemhandel_identifier_type'] if 'l10n_dk_nemhandel_identifier_type' in vals else type # let users remove the value
        identifier_value = vals['l10n_dk_nemhandel_identifier_value'] if 'l10n_dk_nemhandel_identifier_value' in vals else value
        if not identifier_type or not identifier_value:
            return vals

        # if peppol_eas == '0208':
        #     cbe_match = re.search('[0-9]{10}', peppol_endpoint)
        #     if bool(cbe_match):
        #         vals['peppol_endpoint'] = cbe_match.group(0)
        return vals

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals = self._sanitize_l10n_dk_nemhandel_endpoint(vals)
        return super().create(vals_list)

    def write(self, vals):
        for company in self:
            vals = self._sanitize_l10n_dk_nemhandel_endpoint(vals, company.l10n_dk_nemhandel_identifier_type, company.l10n_dk_nemhandel_identifier_value)
        return super().write(vals)
