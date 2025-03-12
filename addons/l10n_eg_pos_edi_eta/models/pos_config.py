from odoo import fields, models, _
from odoo.exceptions import UserError, ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    country_code = fields.Char(related='company_id.account_fiscal_country_id.code')
    l10n_eg_production_env = fields.Boolean(related='company_id.l10n_eg_production_env')

    l10n_eg_pos_serial = fields.Char(string="POS Serial")
    l10n_eg_pos_version = fields.Char(string="POS Version")
    l10n_eg_pos_client_id = fields.Char(string="POS Client ID")
    l10n_eg_pos_client_secret = fields.Char(string="POS Client Secret")
    l10n_eg_pos_model_framework = fields.Char(string="POS Model Framework")
    l10n_eg_pos_client_authenticated = fields.Boolean()

    def l10n_eg_pos_action_authenticate_device(self):
        self.ensure_one()
        if not (
                self.l10n_eg_pos_serial and
                self.l10n_eg_pos_version and
                self.l10n_eg_pos_client_id and
                self.l10n_eg_pos_client_secret
        ):
            raise UserError(_("Please fill all the required fields, including Serial, Version & Client credentials."))
        if self.company_id.l10n_eg_production_env:
            request_url = '/connect/token'
            request_data = {
                'body': {
                    'grant_type': 'client_credentials',
                    'client_id': self.l10n_eg_pos_client_id,
                    'client_secret': self.l10n_eg_pos_client_secret,
                },
                'header': {
                    'posserial': self.l10n_eg_pos_serial,
                    'pososversion': self.l10n_eg_pos_version,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
            response_data = self.env.ref('l10n_eg_edi_eta.edi_eg_eta')._l10n_eg_eta_connect_to_server(
                request_data, request_url, 'POST', is_access_token_req=True,
                production_enviroment=self.company_id.l10n_eg_production_env
            )
            if response_data.get('error'):
                raise UserError(
                    _(
                        """Could not authenticate the device, please check the credentials and try again.\n 
                        Error: %s""", response_data.get('error')
                    )
                )
        self.l10n_eg_pos_client_authenticated = True

    def _l10n_eg_pos_check_device_status(self):
        if self.filtered(lambda config: config.country_code == 'EG' and not config.l10n_eg_pos_client_authenticated):
            raise ValidationError(_("This POS device needs to be activated as per ETA eReceipts integration standards."))

    def _check_before_creating_new_session(self):
        super()._check_before_creating_new_session()
        self._l10n_eg_pos_check_device_status()
