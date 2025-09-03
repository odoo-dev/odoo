from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Everything is put under config parameter because we want to make user each database
    # is associated with just 1 pajak.io account
    l10n_id_pajakio_mode = fields.Selection(
        [
            ("test", "Testing"),
            ("prod", "Production")
        ],
        default="test",
        config_parameter="l10n_id_pajakio.mode",
        string="Pajak.io operation mode"
    )
    l10n_id_pajakio_test_client_id = fields.Char(
        config_parameter="l10n_id_pajakio.test_client_id",
        string="Pajak.io Client ID",
        help="Client ID is stored which later on can retrieve API key and store it on IAP server",
    )
    l10n_id_pajakio_client_id = fields.Char(
        config_parameter="l10n_id_pajakio.client_id",
        string="Pajak.io Client ID",
    )

    # Test and Production account credential
    l10n_id_pajakio_test_email = fields.Char(string="Pajak.io Testing Account Email", config_parameter="l10n_id_pajakio.test_email")
    l10n_id_pajakio_test_password = fields.Char(string="Pajak.io Testing Account Password", config_parameter="l10n_id_pajakio.test_password")

    l10n_id_pajakio_email = fields.Char(string="Pajak.io Production Account Email", config_parameter="l10n_id_pajakio.email")
    l10n_id_pajakio_password = fields.Char(string="Pajak.io Production Account Password", config_parameter="l10n_id_pajakio.password")

    l10n_id_pajakio_hide_register = fields.Boolean(
        string="Hide Production Account Registration",
        help="If you have already registered a Pajak.io production account, you can hide the registration button",
        compute="_compute_l10n_id_pajakio_register_button"
    )

    def action_sign_in_pajakio(self):
        """ If user already has an account, they can sign in and retrieve the Client ID, which
         we can continue with action_link_company_iap """
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'l10n_id_pajakio.signin',
            'view_mode': 'form',
            'target': 'new',
        }


    def action_register_user_pajakio(self):
        """ Return the wizard screen to allow user register a Pajak.io user account"""
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'l10n_id_pajakio.register.user',
            'view_mode': 'form',
            'target': 'new',
        }

    
    def action_register_company_pajakio(self):
        """ return wizard screen to allow company registration, carrying email and password
        information from the previous"""

        mode = self.env['ir.config_parameter'].sudo().get_param('l10n_id_pajakio_mode')
        email = self.l10n_id_pajakio_test_email if mode == "test" else self.l10n_id_pajakio_email
        password = self.l10n_id_pajakio_test_password if mode == "test" else self.l10n_id_pajakio_password

        return {
            'type': 'ir.actions.act_window',
            'res_model': 'l10n_id_pajakio.register.company',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_email': email,
                'default_password': password
            }
        }
    
    def action_link_company_iap(self):
        """ Call the registration """
        #TODO : change to make it more generic
        # Force to create IAP account of Pajak.io before actually handling the service
        account_id = self.env['iap.account'].get_account_id("l10n_id_pajakio_proxy")
        params = {
            "client_id": self.env['ir.config_parameter'].get_param('l10n_id_pajakio.test_client_id')
        }
        self.env['iap.account']._l10n_id_pajakio_iap_connect(
            params,
            "/l10n_id_pajakio/register",
        )


    def _compute_l10n_id_pajakio_register_button(self):
        """ Compute whether to hide register button or not based on whether the test/prod email
        and password is already filled in"""

        config_param = self.env['ir.config_parameter'].sudo()
        mode = config_param.get_param('l10n_id_pajakio.mode')
        for record in self:
            if mode == "test":
                record.l10n_id_pajakio_hide_register = bool(config_param.get_param('l10n_id_pajakio.test_client_id')) or bool(config_param.get_param('l10n_id_pajakio.test_email') and config_param.get_param('l10n_id_pajakio.test_password'))
            else:
                record.l10n_id_pajakio_hide_register = bool(config_param.get_param('l10n_id_pajakio.client_id')) or bool(config_param.get_param('l10n_id_pajakio.email') and config_param.get_param('l10n_id_pajakio.password'))
