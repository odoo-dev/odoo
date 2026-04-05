# Part of Odoo. See LICENSE file for full copyright and licensing details.

import contextlib
import requests
from lxml import etree

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools.urls import urljoin
from odoo.addons.account.models.company import PEPPOL_LIST

try:
    import phonenumbers
except ImportError:
    phonenumbers = None


class ResCompany(models.Model):
    _inherit = 'res.company'

    account_peppol_edi_user = fields.Many2one(
        comodel_name='account_edi_proxy_client.user',
        compute='_compute_account_peppol_edi_user',
    )
    peppol_send_from_endpoint = fields.Char(compute='_compute_account_peppol_edi_user')
    account_peppol_proxy_state = fields.Selection(
        selection=[
            ('not_registered', 'Not registered'),
            ('sender', 'Can send but not receive'),
            ('smp_registration', 'Can send, pending registration to receive'),
            ('receiver', 'Can send and receive'),
            ('rejected', 'Rejected'),
        ],
        string='PEPPOL status', required=True, default='not_registered',
    )
    account_peppol_contact_email = fields.Char(
        string='Primary contact email',
        compute='_compute_account_peppol_contact_email', store=True, readonly=False,
        help='Primary contact email for Peppol connection related communications and notifications.\n'
             'In particular, this email is used by Odoo to reconnect your Peppol account in case of database change.',
    )
    account_peppol_phone_number = fields.Char(
        string='Mobile number',
        compute='_compute_account_peppol_phone_number', store=True, readonly=False,
        help='This number is used for identification purposes only.',
    )
    peppol_purchase_journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='Peppol Purchase Journal',
        domain=[('type', '=', 'purchase')],
        compute='_compute_peppol_purchase_journal_id',
        store=True,
        readonly=False,
        inverse='_inverse_peppol_purchase_journal_id',
    )
    peppol_external_provider = fields.Char(tracking=True)
    peppol_can_send = fields.Boolean(compute='_compute_peppol_can_send')
    peppol_parent_company_id = fields.Many2one(comodel_name='res.company', compute='_compute_peppol_parent_company_id')
    # IAP-driven metadata with additive keys
    peppol_metadata = fields.Json(string='Peppol Metadata')
    peppol_metadata_updated_at = fields.Datetime(string='Peppol meta updated at')

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _get_active_peppol_parent_company(self):
        """
        Gets the closest parent company (relative from the current)
        that has an active peppol connection.
        :return: res.company record: containing single company if found, empty if not.
        """
        self.ensure_one()

        for parent_company in self.sudo().parent_ids[::-1][1:]:  # loop through parent companies starting from the closest parent
            if parent_company.sudo().peppol_can_send:
                return parent_company

        return self.env['res.company']

    def _have_unauthorized_peppol_parent_company(self):
        """
        Returns True if the company is using the active peppol connection of the parent company
        but the user does not have access to that parent company.
        """
        self.ensure_one()
        parent_company = self.peppol_parent_company_id
        return parent_company and parent_company not in self.env.user.company_ids

    def _reset_peppol_configuration(self, soft=False):
        """
        Reset all peppol configuration fields to their default value before registering.
        The EAS, endpoint, email, and phone number will be recomputed so that branch companies that uses
        their parent configuration can have their default values back
        (as these fields will be overwritten for them when they register as parent).

        :param soft: If True, will only set state to unregistered, but keep peppol config intact, so the user can register again
        """
        self.account_peppol_proxy_state = 'not_registered'
        if not soft:
            self.peppol_send_from_endpoint = False
            self.account_peppol_contact_email = False
            self.account_peppol_phone_number = False

            self._compute_account_peppol_contact_email()
            self._compute_account_peppol_phone_number()

    @api.model
    def _check_phonenumbers_import(self):
        if not phonenumbers:
            raise ValidationError(_("Please install the phonenumbers library."))

    def _sanitize_peppol_phone_number(self, phone_number=None):
        self.ensure_one()

        error_message = _(
            "Please enter the mobile number in the correct international format.\n"
            "For example: +32123456789, where +32 is the country code.")

        self._check_phonenumbers_import()

        phone_number = phone_number or self.account_peppol_phone_number
        if not phone_number:
            return

        if not phone_number.startswith('+'):
            phone_number = f'+{phone_number}'

        try:
            phone_nbr = phonenumbers.parse(phone_number)
        except phonenumbers.phonenumberutil.NumberParseException:
            raise ValidationError(error_message)

        if not phonenumbers.is_valid_number(phone_nbr):
            raise ValidationError(error_message)

    # -------------------------------------------------------------------------
    # CONSTRAINTS
    # -------------------------------------------------------------------------

    @api.constrains('account_peppol_phone_number')
    def _check_account_peppol_phone_number(self):
        for company in self:
            if company.account_peppol_phone_number:
                company._sanitize_peppol_phone_number()

    @api.constrains('peppol_purchase_journal_id')
    def _check_peppol_purchase_journal_id(self):
        for company in self:
            if company.peppol_purchase_journal_id and company.peppol_purchase_journal_id.type != 'purchase':
                raise ValidationError(_("A purchase journal must be used to receive Peppol documents."))

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    @api.depends('account_edi_proxy_client_ids')
    def _compute_account_peppol_edi_user(self):
        for company in self:
            edi_proxy_user = company.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'peppol')[:1]
            company.account_peppol_edi_user = edi_proxy_user
            company.peppol_send_from_endpoint = edi_proxy_user.edi_identification

    @api.depends('peppol_send_from_endpoint',)
    def _compute_peppol_parent_company_id(self):
        self.peppol_parent_company_id = False
        for company in self:
            for parent_company in company.parent_ids[::-1][1:]:
                if (
                    company.peppol_send_from_endpoint
                    and company.peppol_send_from_endpoint == parent_company.peppol_send_from_endpoint
                ) or (
                    not company.peppol_send_from_endpoint
                    and parent_company.peppol_send_from_endpoint
                ):
                    company.peppol_parent_company_id = parent_company
                    break

    @api.depends('account_peppol_proxy_state')
    def _compute_peppol_purchase_journal_id(self):
        for company in self:
            if not company.peppol_purchase_journal_id and company.peppol_can_send:
                company.peppol_purchase_journal_id = self.env['account.journal'].search([
                    *self.env['account.journal']._check_company_domain(company),
                    ('type', '=', 'purchase'),
                ], limit=1)
                company.peppol_purchase_journal_id.is_peppol_journal = True

    def _inverse_peppol_purchase_journal_id(self):
        for company in self:
            # This avoid having 2 or more purchase journals from the same company with
            # `is_peppol_journal` set to True (which could occur after changes).
            journals_to_reset = self.env['account.journal'].search([
                ('company_id', '=', company.id),
                ('type', '=', 'purchase'),
                ('is_peppol_journal', '=', True),
            ])
            journals_to_reset.is_peppol_journal = False
            company.peppol_purchase_journal_id.is_peppol_journal = True

    @api.depends('email')
    def _compute_account_peppol_contact_email(self):
        for company in self:
            if not company.account_peppol_contact_email:
                company.account_peppol_contact_email = company.email

    @api.depends('phone')
    def _compute_account_peppol_phone_number(self):
        for company in self:
            if not company.account_peppol_phone_number:
                try:
                    # precompute only if it's a valid phone number
                    company._sanitize_peppol_phone_number(company.phone)
                    company.account_peppol_phone_number = company.phone
                except ValidationError:
                    continue

    @api.depends('account_peppol_proxy_state')
    def _compute_peppol_can_send(self):
        can_send_domain = self.env['account_edi_proxy_client.user']._get_can_send_domain()
        for company in self:
            company.peppol_can_send = company.account_peppol_proxy_state in can_send_domain

    # -------------------------------------------------------------------------
    # LOW-LEVEL METHODS
    # -------------------------------------------------------------------------

    @api.model
    def _sanitize_peppol_endpoint_in_values(self, values):
        if endpoint := values.get('peppol_send_from_endpoint'):
            validation = validate_participant_identifier(endpoint)
            if validation['valid']:
                values['peppol_send_from_endpoint'] = validation['value']

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._sanitize_peppol_endpoint_in_values(vals)
        return super().create(vals_list)

    def write(self, vals):
        self._sanitize_peppol_endpoint_in_values(vals)
        return super().write(vals)

    # -------------------------------------------------------------------------
    # PEPPOL PARTICIPANT MANAGEMENT
    # -------------------------------------------------------------------------

    # TODO list of supported documents for company should be fetch from IAP -> dynamic

    def _get_peppol_edi_mode(self, temporary_eas=False):
        self.ensure_one()
        config_param = self.env['ir.config_parameter'].sudo().get_str('account_peppol.edi.mode')
        # by design, we can only have zero or one proxy user per company with type Peppol
        peppol_user = self.sudo().account_peppol_edi_user
        demo_if_demo_identifier = 'demo' if temporary_eas == 'odemo' else False
        return demo_if_demo_identifier or peppol_user.edi_mode or config_param or 'prod'

    def _get_peppol_webhook_endpoint(self):
        self.ensure_one()
        return urljoin(self.get_base_url(), '/peppol/webhook')

    def _account_peppol_send_welcome_email(self):
        self.ensure_one()
        if self.account_peppol_proxy_state not in ('sender', 'receiver'):
            return

        mail_template = self.env.ref('account_peppol.mail_template_peppol_registration', raise_if_not_found=False)
        if not mail_template:
            return

        mail_template.send_mail(self.id, force_send=True)
