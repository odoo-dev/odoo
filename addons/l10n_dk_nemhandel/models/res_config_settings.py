# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models, modules, tools
from odoo.exceptions import UserError, ValidationError

from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.l10n_dk_nemhandel.tools.demo_utils import handle_demo


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_dk_nemhandel_edi_user = fields.Many2one(
        comodel_name='account_edi_proxy_client.user',
        string='EDI user',
        compute='_compute_l10n_dk_nemhandel_edi_user',
    )
    l10n_dk_nemhandel_contact_email = fields.Char(related='company_id.l10n_dk_nemhandel_contact_email', readonly=False)
    l10n_dk_nemhandel_identifier_type = fields.Selection(related='company_id.l10n_dk_nemhandel_identifier_type', readonly=False)
    l10n_dk_nemhandel_identifier_value = fields.Char(related='company_id.l10n_dk_nemhandel_identifier_value', readonly=False)
    l10n_dk_nemhandel_phone_number = fields.Char(related='company_id.l10n_dk_nemhandel_phone_number', readonly=False)
    l10n_dk_nemhandel_proxy_state = fields.Selection(related='company_id.l10n_dk_nemhandel_proxy_state', readonly=False)
    l10n_dk_nemhandel_purchase_journal_id = fields.Many2one(related='company_id.l10n_dk_nemhandel_purchase_journal_id', readonly=False)
    l10n_dk_nemhandel_verification_code = fields.Char(related='l10n_dk_nemhandel_edi_user.l10n_dk_nemhandel_verification_code', readonly=False)
    l10n_dk_nemhandel_edi_mode = fields.Selection(
        selection=[('demo', 'Demo'), ('test', 'Test'), ('prod', 'Live')],
        compute='_compute_l10n_dk_nemhandel_edi_mode',
        inverse='_inverse_l10n_dk_nemhandel_edi_mode',
        readonly=False,
    )
    l10n_dk_nemhandel_edi_mode_constraint = fields.Selection(
        selection=[('demo', 'Demo'), ('test', 'Test'), ('prod', 'Live')],
        compute='_compute_l10n_dk_nemhandel_edi_mode_constraint',
        help="Using the config params, this field specifies which edi modes may be selected from the UI"
    )

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _call_l10n_dk_nemhandel_proxy(self, endpoint, params=None, edi_user=None):
        errors = {
            'code_incorrect': _('The verification code is not correct'),
            'code_expired': _('This verification code has expired. Please request a new one.'),
            'too_many_attempts': _('Too many attempts to request an SMS code. Please try again later.'),
        }

        if not edi_user:
            edi_user = self.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'l10n_dk_nemhandel')

        params = params or {}
        try:
            response = edi_user._make_request(
                f"{edi_user._get_server_url()}{endpoint}",
                params=params,
            )
        except AccountEdiProxyError as e:
            raise UserError(e.message)

        if 'error' in response:
            error_code = response['error'].get('code')
            error_message = response['error'].get('message') or response['error'].get('data', {}).get('message')
            raise UserError(errors.get(error_code) or error_message or _('Connection error, please try again later.'))
        return response

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------
    @api.depends('l10n_dk_nemhandel_edi_user')
    def _compute_l10n_dk_nemhandel_edi_mode_constraint(self):
        mode_constraint = self.env['ir.config_parameter'].sudo().get_param('l10n_dk_nemhandel.mode_constraint')
        trial_param = self.env['ir.config_parameter'].sudo().get_param('saas_trial.confirm_token')
        self.l10n_dk_nemhandel_edi_mode_constraint = trial_param and 'demo' or mode_constraint or 'prod'

    @api.depends('l10n_dk_nemhandel_edi_user')
    def _compute_l10n_dk_nemhandel_edi_mode(self):
        edi_mode = self.env['ir.config_parameter'].sudo().get_param('l10n_dk_nemhandel.edi.mode')
        for config in self:
            if config.l10n_dk_nemhandel_edi_user:
                config.l10n_dk_nemhandel_edi_mode = config.l10n_dk_nemhandel_edi_user.edi_mode
            else:
                config.l10n_dk_nemhandel_edi_mode = edi_mode or 'prod'

    def _inverse_l10n_dk_nemhandel_edi_mode(self):
        for config in self:
            if not config.l10n_dk_nemhandel_edi_user and config.l10n_dk_nemhandel_edi_mode:
                self.env['ir.config_parameter'].sudo().set_param('l10n_dk_nemhandel.edi.mode', config.l10n_dk_nemhandel_edi_mode)
                return

    @api.depends("company_id.account_edi_proxy_client_ids")
    def _compute_l10n_dk_nemhandel_edi_user(self):
        for config in self:
            config.l10n_dk_nemhandel_edi_user = config.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'l10n_dk_nemhandel')

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    @handle_demo
    def button_create_l10n_dk_nemhandel_proxy_user(self):
        """
        The first step of the Nemhandel onboarding.
        - Creates an EDI proxy user on the iap side, then the client side
        - Calls /activate_participant to mark the EDI user as l10n_dk_nemhandel user
        """
        self.ensure_one()

        if self.l10n_dk_nemhandel_proxy_state != 'not_registered':
            raise UserError(
                _('Cannot register a user with a %s application', self.l10n_dk_nemhandel_proxy_state))
        if not self.l10n_dk_nemhandel_contact_email:
            raise ValidationError(_("Please enter a primary contact email to verify your application."))

        if not self.l10n_dk_nemhandel_phone_number:
            raise ValidationError(_("Please enter a phone number to verify your application."))

        company = self.company_id
        edi_proxy_client = self.env['account_edi_proxy_client.user']
        edi_identification = edi_proxy_client._get_proxy_identification(company, 'l10n_dk_nemhandel')

        edi_user = edi_proxy_client.sudo()._register_proxy_user(company, 'l10n_dk_nemhandel', self.l10n_dk_nemhandel_edi_mode)
        self.l10n_dk_nemhandel_proxy_state = 'not_verified'

        # if there is an error when activating the participant below,
        # the client side is rolled back and the edi user is deleted on the client side
        # but remains on the proxy side.
        # it is important to keep these two in sync, so commit before activating.
        if not tools.config['test_enable'] and not modules.module.current_test:
            self.env.cr.commit()

        company_details = {
            'l10n_dk_nemhandel_company_name': company.display_name,
            'l10n_dk_nemhandel_company_vat': company.vat,
            'l10n_dk_nemhandel_company_street': company.street,
            'l10n_dk_nemhandel_company_city': company.city,
            'l10n_dk_nemhandel_company_zip': company.zip,
            'l10n_dk_nemhandel_country_code': company.country_id.code,
            'l10n_dk_nemhandel_phone_number': self.l10n_dk_nemhandel_phone_number,
            'l10n_dk_nemhandel_contact_email': self.l10n_dk_nemhandel_contact_email,
        }

        params = {
            'company_details': company_details,
        }

        self._call_l10n_dk_nemhandel_proxy(
            endpoint='/api/l10n_dk_nemhandel/1/activate_participant',
            params=params,
            edi_user=edi_user,
        )

    @handle_demo
    def button_l10n_dk_nemhandel_update_user_data(self):
        """
        Action for the user to be able to update their contact details any time
        Calls /update_user on the iap server
        """
        self.ensure_one()

        if not self.l10n_dk_nemhandel_contact_email or not self.l10n_dk_nemhandel_phone_number:
            raise ValidationError(_("Contact email and phone number are required."))

        params = {
            'update_data': {
                'l10n_dk_nemhandel_phone_number': self.l10n_dk_nemhandel_phone_number,
                'l10n_dk_nemhandel_contact_email': self.l10n_dk_nemhandel_contact_email,
            }
        }

        self._call_l10n_dk_nemhandel_proxy(
            endpoint='/api/l10n_dk_nemhandel/1/update_user',
            params=params,
        )

    def button_l10n_dk_nemhandel_send_verification_code(self):
        """
        Request user verification via SMS
        Calls the /send_verification_code to send the 6-digit verification code
        """
        self.ensure_one()

        # update contact details in case the user made changes
        self.button_update_l10n_dk_nemhandel_user_data()

        self._call_l10n_dk_nemhandel_proxy(
            endpoint='/api/l10n_dk_nemhandel/1/send_verification_code',
            params={'message': _("Your confirmation code is")},
        )
        self.l10n_dk_nemhandel_proxy_state = 'sent_verification'

    def button_l10n_dk_nemhandel_check_verification_code(self):
        """
        Calls /verify_phone_number to compare user's input and the
        code generated on the IAP server
        """
        self.ensure_one()

        if len(self.l10n_dk_nemhandel_verification_code) != 6:
            raise ValidationError(_("The verification code should contain six digits."))

        self._call_l10n_dk_nemhandel_proxy(
            endpoint='/api/l10n_dk_nemhandel/1/verify_phone_number',
            params={'verification_code': self.l10n_dk_nemhandel_verification_code},
        )
        self.l10n_dk_nemhandel_proxy_state = 'pending'
        self.l10n_dk_nemhandel_verification_code = False
        # in case they have already been activated on the IAP side
        self.env.ref('l10n_dk_nemhandel.ir_cron_l10n_dk_nemhandel_get_participant_status')._trigger()

    def button_l10n_dk_nemhandel_cancel_registration(self):
        """
        Sets the nemhandel registration to canceled
        - 'not_registered', 'rejected', 'canceled' proxy states mean that canceling the registration
          makes no sense, so we don't do it
        - Calls the IAP server first before setting the state as canceled on the client side,
          in case they've been activated on the IAP side in the meantime
        """
        self.ensure_one()
        # check if the participant has been already registered
        self.l10n_dk_nemhandel_edi_user._l10n_dk_nemhandel_get_participant_status()
        if not tools.config['test_enable'] and not modules.module.current_test:
            self.env.cr.commit()

        if self.l10n_dk_nemhandel_proxy_state in {'not_registered', 'rejected', 'canceled'}:
            raise UserError(_(
                "Can't cancel registration with this status: %s", self.l10n_dk_nemhandel_proxy_state
            ))

        self._call_l10n_dk_nemhandel_proxy(endpoint='/api/l10n_dk_nemhandel/1/cancel_l10n_dk_nemhandel_registration')
        self.l10n_dk_nemhandel_proxy_state = 'not_registered'
        self.l10n_dk_nemhandel_edi_user.unlink()

    @handle_demo
    def button_l10n_dk_nemhandel_participant(self):
        """
        Deregister the edi user from Nemhandel network
        """
        self.ensure_one()

        if self.l10n_dk_nemhandel_proxy_state != 'active':
            raise UserError(_(
                "Can't deregister with this status: %s", self.l10n_dk_nemhandel_proxy_state
            ))

        # fetch all documents and message statuses before unlinking the edi user
        # so that the invoices are acknowledged
        self.env['account_edi_proxy_client.user']._cron_l10n_dk_nemhandel_get_message_status()
        self.env['account_edi_proxy_client.user']._cron_l10n_dk_nemhandel_get_new_documents()
        if not tools.config['test_enable'] and not modules.module.current_test:
            self.env.cr.commit()

        self._call_l10n_dk_nemhandel_proxy(endpoint='/api/peppol/1/cancel_l10n_dk_nemhandel_registration')
        self.l10n_dk_nemhandel_proxy_state = 'not_registered'
        self.l10n_dk_nemhandel_edi_user.unlink()
