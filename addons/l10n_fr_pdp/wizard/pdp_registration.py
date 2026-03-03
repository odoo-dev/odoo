import contextlib

from odoo.addons.iap.tools import iap_tools

try:
    import phonenumbers
except ImportError:
    phonenumbers = None

from odoo import _, api, fields, models, modules
from odoo.exceptions import UserError, ValidationError


class PdpRegistration(models.TransientModel):
    _name = 'pdp.registration'
    _description = "PDP Registration"

    company_id = fields.Many2one(
        comodel_name='res.company',
        required=True,
        default=lambda self: self.env.company,
    )
    contact_email = fields.Char(
        related='company_id.pdp_contact_email',
        readonly=False,
        required=True,
    )
    phone_number = fields.Char(related='company_id.pdp_phone_number', readonly=False)
    pdp_identifier = fields.Char(related='company_id.pdp_identifier', readonly=False, required=True)
    edi_mode = fields.Selection(
        string='EDI mode',
        selection=[('demo', 'Demo'), ('test', 'Test'), ('prod', 'Live')],
        compute='_compute_edi_mode',
        readonly=False,
    )
    edi_user_id = fields.Many2one(
        comodel_name='account_edi_proxy_client.user',
        string='EDI user',
        compute='_compute_edi_user_id',
    )
    l10n_fr_pdp_proxy_state = fields.Selection(related='company_id.l10n_fr_pdp_proxy_state', readonly=False)
    warnings = fields.Json(
        string="Warnings",
        compute="_compute_warnings",
    )
    siren_number = fields.Char(compute='_compute_siren_number', store=True, readonly=False)
    kyb_status = fields.Selection(
        selection=[
            ('none', "None"),
            ('processing', "Processing"),
            ('queuing', "Queuing"),
            ('done', "Done"),
        ],
        default='none',
    )
    kyc_status = fields.Selection(
        selection=[
            ('none', "None"),
            ('processing', "Processing"),
            ('done', "Done"),
        ],
        default='none',
    )

    control_id = fields.Char()
    folder_link = fields.Char()
    available_partner_ids = fields.Many2many('res.partner')
    selected_representative_id = fields.Many2one(
        'res.partner',
        string="Legal Representative",
        domain="[('id', 'in', available_partner_ids)]"
    )
    birth_date = fields.Date(
        compute='_compute_birth_date',
        readonly=False,
    )

    # -------------------------------------------------------------------------
    # ONCHANGE METHODS
    # -------------------------------------------------------------------------

    @api.onchange('pdp_identifier')
    def _onchange_pdp_identifier(self):
        for wizard in self:
            if wizard.pdp_identifier:
                wizard.pdp_identifier = ''.join(char for char in wizard.pdp_identifier if char == '_' or char.isalnum())

    @api.onchange('phone_number')
    def _onchange_phone_number(self):
        self.env['res.company']._check_phonenumbers_import()
        for wizard in self:
            if wizard.phone_number:
                # The `phone_number` we set is not necessarily valid (may fail `_sanitize_peppol_phone_number`)
                with contextlib.suppress(phonenumbers.NumberParseException):
                    parsed_phone_number = phonenumbers.parse(
                        wizard.phone_number,
                        region=wizard.company_id.country_code,
                    )
                    wizard.phone_number = phonenumbers.format_number(
                        parsed_phone_number,
                        phonenumbers.PhoneNumberFormat.E164,
                    )

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------
    @api.depends('selected_representative_id')
    def _compute_birth_date(self):
        for wizard in self:
            wizard.birth_date = wizard.selected_representative_id.birth_date or fields.Date.context_today(self)

    @api.depends('company_id.siret')
    def _compute_siren_number(self):
        for wizard in self:
            wizard.siren_number = wizard.company_id.siret[:9] if wizard.company_id.siret else ''

    @api.depends('company_id.account_edi_proxy_client_ids')
    def _compute_edi_user_id(self):
        for wizard in self:
            wizard.edi_user_id = wizard.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'pdp')[:1]

    @api.depends('edi_user_id')
    def _compute_edi_mode(self):
        for wizard in self:
            wizard.edi_mode = wizard.company_id._get_pdp_edi_mode()

    @api.depends('pdp_identifier')
    def _compute_warnings(self):
        for wizard in self:
            warnings = {}
            if (
                wizard.pdp_identifier
                and not wizard.company_id._check_pdp_identifier(wizard.pdp_identifier, warning=True)
            ):
                warnings['company_pdp_identifier_warning'] = {
                    'level': 'warning',
                    'message': _("The endpoint number might not be correct. "
                                "Please check if you entered the right identification number."),
                }
            # TODO: check annuaire whether it is already registered
            wizard.warnings = warnings or False

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _ensure_mandatory_fields(self):
        if not self.contact_email or not self.phone_number:
            raise ValidationError(_("Contact email and phone number are required."))

    def _action_send_notification(self, title, message):
        move_ids = self.env.context.get('active_ids')
        if move_ids and self.env.context.get('active_model') == 'account.move':
            next_action = self.env['account.move'].browse(move_ids).action_send_and_print()
            next_action['views'] = [(False, 'form')]
        else:
            next_action = {'type': 'ir.actions.act_window_close'}

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': title,
                'type': 'success',
                'message': message,
                'next': next_action,
            }
        }

    def _action_open_pdp_form(self, reopen=True):
        return self._get_records_action(
            name=_("Send via PDP"),
            target='new',
        )

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def button_trigger_kyb_flow(self):
        self.ensure_one()
        endpoint = self.env['ir.config_parameter'].sudo().get_param('iap.l10n_fr_pdp', 'http://localhost:8469')
        response = iap_tools.iap_jsonrpc(f'{endpoint}/api/pdp/1/kyb_flow', params={
            'siren': self.siren_number,
        })
        if response.get('status') == 'failed':
            raise UserError(self.env._("The siren number couldn't be validated"))

        result = self._get_kyb_wizard_data(response)
        wizard = self.env['pdp.registration'].create([result])
        return wizard._action_open_pdp_form()

    def button_refresh_kyb_flow(self):
        self.ensure_one()
        endpoint = self.env['ir.config_parameter'].sudo().get_param('iap.l10n_fr_pdp', 'http://localhost:8469')
        response = iap_tools.iap_jsonrpc(f'{endpoint}/api/pdp/1/kyb_refresh', params={
            'control_id': self.control_id,
        })
        if response.get('status') == 'FAILED':
            raise UserError(self.env._("The siren number couldn't be validated"))

        result = self._get_kyb_wizard_data(response)
        wizard = self.env['pdp.registration'].create([result])
        return wizard._action_open_pdp_form()

    def _get_kyb_wizard_data(self, response):
        result = {
            'company_id': self.company_id.id,
            'kyb_status': response['status'].lower(),
            'siren_number': self.siren_number,
            'control_id': response.get('control_id'),
        }
        if response.get('status') != 'DONE':
            return result

        if not response.get('legal_entities'):
            raise UserError(self.env._("No legal entities found."))

        legal_entities = []
        for legal_entity in response['legal_entities']:
            legal_entities.append({
                'name': f"{legal_entity.get('firstName').title()},{legal_entity.get('lastName').title()}",
                'birth_date': fields.Date.from_string(legal_entity.get('birthDate')),
                'company_type': 'person',
                'parent_id': self.company_id.partner_id.id,
            })
        partners = self.env['res.partner'].create(legal_entities)
        result['available_partner_ids'] = partners.ids
        result['selected_representative_id'] = partners[0].id
        return result

    def button_trigger_kyc_flow(self):
        self.ensure_one()
        endpoint = self.env['ir.config_parameter'].sudo().get_param('iap.l10n_fr_pdp', 'http://localhost:8469')
        name = self.selected_representative_id.name.split(',')
        response = iap_tools.iap_jsonrpc(f'{endpoint}/api/pdp/1/kyc_flow', params={
            'first_name': name[0],
            'last_name': name[1],
            'birth_date': fields.Date.to_string(self.selected_representative_id.birth_date),
            'phone_number': self.phone_number,
        })

        self.kyc_status = 'processing'
        self.folder_link = response.get('folder_link')

        if link := response.get('link'):
            return {
                'type': 'ir.actions.act_url',
                'url': link,
                'target': 'new',
            }

    def button_refresh_kyc_flow(self):
        self.ensure_one()
        endpoint = self.env['ir.config_parameter'].sudo().get_param('iap.l10n_fr_pdp', 'http://localhost:8469')
        response = iap_tools.iap_jsonrpc(f'{endpoint}/api/pdp/1/kyc_refresh', params={
            'folder_link': self.folder_link or '',
        })

        result = self._get_kyc_wizard_data(response)
        wizard = self.env['pdp.registration'].create([result])
        return wizard._action_open_pdp_form()

    def _get_kyc_wizard_data(self, response):
        # https://app.vialink.biz/horizon/redoc/horizon#tag/Folder-Participants/operation/listFolderParticipants
        response_status = response.get('status')
        if response_status in {'FAIL', 'ERROR', 'DECLINED', 'REJECTED'}:
            raise UserError(self.env._("The KYC flow failed."))
        elif response_status in {'CREATED', 'IN_PROGRESS'}:
            kyc_status = 'processing'
        elif response_status == 'PASS':
            kyc_status = 'done'
        else:
            kyc_status = 'none'

        result = {
            'company_id': self.company_id.id,
            'kyb_status': self.kyb_status,
            'folder_link': response.get('folder_link'),
            'kyc_status': kyc_status,
        }
        return result

    def button_register_pdp_participant(self):
        self.ensure_one()

        self._ensure_mandatory_fields()

        if self.l10n_fr_pdp_proxy_state in ('pending', 'receiver'):
            pdp_state_translated = dict(self._fields['l10n_fr_pdp_proxy_state'].selection)[self.l10n_fr_pdp_proxy_state]
            raise UserError(
                _('Cannot register a user with a %s application', pdp_state_translated))

        edi_user = self.edi_user_id or self.env['account_edi_proxy_client.user']._register_proxy_user(self.company_id, 'pdp', self.edi_mode)

        # if there is an error when activating the participant below,
        # the client side is rolled back and the edi user is deleted on the client side
        # but remains on the proxy side.
        # it is important to keep these two in sync, so commit before activating.
        if not modules.module.current_test:
            self.env.cr.commit()

        if self.l10n_fr_pdp_proxy_state not in ('pending', 'receiver'):
            edi_user._pdp_register_receiver()
            self.invalidate_recordset()  # registering may i.e. have changed self.l10n_fr_pdp_proxy_state

        notifications = {
            False: _('Something went wrong.'),
            'pending': _('Your registration will be activated soon.'),
            'receiver': _('You can now send and receive electronic invoices.'),
            'rejected': _('Your registration has been rejected.'),
        }
        return self._action_send_notification(
            title="PDP Status",
            message=notifications[self.l10n_fr_pdp_proxy_state],
        )

    def button_deregister_pdp_participant(self):
        """
        Deregister the edi user from PDP network
        """
        self.ensure_one()

        if self.edi_user_id:
            self.edi_user_id._pdp_deregister_participant()
