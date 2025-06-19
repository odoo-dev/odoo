import base64
from odoo import models, fields, _
from odoo.exceptions import UserError

from odoo.addons.l10n_pl_edi.models.l10n_pl_edi_sign import XadesSigner
from odoo.addons.l10n_pl_edi.models.l10n_pl_ksef_api import KsefApiService


class L10nPlEdiCertUploadWizard(models.TransientModel):
    _name = 'l10n.pl.edi.cert.upload.wizard'
    _description = 'KSeF Certificate Upload Wizard'

    certificate_file = fields.Binary(
        string="Certificate File (.crt)",
        required=True,
        attachment=False,
        help="Upload your public certificate file (e.g., Cert.crt)."
    )
    certificate_filename = fields.Char(string="Certificate File Name")

    private_key_file = fields.Binary(
        string="Private Key File (.key)",
        required=True,
        attachment=False,
        help="Upload your unencrypted private key file (e.g., Key.key)."
    )
    private_key_filename = fields.Char(string="Private Key File Name")
    certificate_password = fields.Char(string="Certificate password")

    def action_save_certificate(self):
        """
        Saves the uploaded certificate and private key by creating a
        'certificate.certificate' record, then links it to the company.
        """
        self.ensure_one()

        if not self.certificate_file:
            raise UserError(_("You must upload a certificate file."))
        if not self.private_key_file:
            raise UserError(_("You must upload a private key file."))
        if not self.certificate_filename.endswith(('.pem', '.crt')):
            raise UserError(_("The certificate file must be a .pem file."))
        if not self.private_key_filename.endswith(('.pem', '.key')):
            raise UserError(_("The private key file must be a .pem or .key file."))

        cert_pem_bytes = base64.b64decode(self.certificate_file)
        key_pem_bytes = base64.b64decode(self.private_key_file)

        cert_key = self.env['certificate.key'].create({
            'content': base64.b64encode(key_pem_bytes),
            'password': self.certificate_password
        })

        cert_record = self.env['certificate.certificate'].create({
            'name': self.certificate_filename,
            'content': base64.b64encode(cert_pem_bytes),
            'private_key_id': cert_key.id,

        })

        # We link the new record to the company
        self.env.company.write({
            'l10n_pl_edi_certificate': cert_record.id,
        })
        self.authenticate_user_for_ksef()
        return

    def _get_ksef_api_service(self):
        mode = self.env['ir.config_parameter'].sudo().get_param('l10n_pl_edi_ksef.mode') or 'prod'
        return KsefApiService(self.env.company, mode, self.env.company.l10n_pl_ksef_session_id, self.env.company.l10n_pl_ksef_session_key, self.env.company.l10n_pl_ksef_session_iv)

    def authenticate_user_for_ksef(self):
        """Orchestrates the entire authentication flow using the service."""
        ksef_service = self._get_ksef_api_service()
        temp_token, ref_number = None, None
        cert_record = self.env.company.l10n_pl_edi_certificate
        if not cert_record:
            raise UserError(_("A KSeF Certificate & Private Key must be set. Please upload one using the wizard."))

        # We assume the 'certificate.certificate' model has these fields
        if not cert_record.private_key_id:
            raise UserError(_("The selected certificate record (%(name)s) is missing a private key.", name=cert_record.display_name))

        key_bytes = base64.b64decode(cert_record.private_key_id.content)
        cert_bytes = base64.b64decode(cert_record.content)
        cert_content = key_bytes.strip() + b"\n" + cert_bytes.strip()
        signer = XadesSigner(cert_content, self.certificate_password)

        if self.env.company.l10n_pl_edi_certificate:
            # === XAdES Authentication Flow ===
            if not self.env.company.vat:
                raise UserError(_("The company's VAT number is not set."))

            nip = self.env.company.vat.replace("PL", "")
            challenge_data = ksef_service.get_challenge()
            challenge_code = challenge_data.get('challenge')

            signed_xml = signer.sign_authentication_challenge(challenge_code, nip)

            token_data = ksef_service.authenticate_xades(signed_xml)
            temp_token = token_data.get('authenticationToken', {}).get('token')
            ref_number = token_data.get('referenceNumber')

        if not temp_token or not ref_number:
            raise UserError(_("Failed to initiate KSeF authentication."))

        status_data = ksef_service.check_auth_status(ref_number, temp_token)
        if status_data.get('status', {}).get('code') != 200:
            raise UserError(_("KSeF Authentication is still pending or failed."))

        token_data = ksef_service.redeem_token(temp_token)
        access_token = token_data.get('accessToken', {}).get('token')
        refresh_token = token_data.get('refreshToken', {}).get('token')

        if not access_token or not refresh_token:
            raise UserError(_("Failed to retrieve access or refresh tokens."))

        self.env.company.write({
            'l10n_pl_access_token': access_token,
            'l10n_pl_refresh_token': refresh_token,
        })
        return {'type': 'ir.actions.client', 'tag': 'reload'}
