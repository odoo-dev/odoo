import base64
import json
import logging
from werkzeug.urls import url_parse

from odoo import api, Command, fields, models, _
from odoo.http import request
from odoo.tools import sql, SQL
from odoo.addons.base.models.res_users import check_identity

from ..lib.duo_labs.webauthn import base64url_to_bytes, generate_authentication_options, generate_registration_options, options_to_json, verify_authentication_response, verify_registration_response
from ..lib.duo_labs.webauthn.helpers.structs import AuthenticatorSelectionCriteria, ResidentKeyRequirement, UserVerificationRequirement

_logger = logging.getLogger(__name__)


class PassKey(models.Model):
    _name = 'auth.passkey.key'
    _description = 'Passkey'
    _order = 'id desc'

    name = fields.Char(required=True)
    credential_identifier = fields.Char(required=True, groups='base.group_system')
    public_key = fields.Char(required=True, groups='base.group_system', compute='_compute_public_key', inverse='_inverse_public_key')
    sign_count = fields.Integer(default=0, groups='base.group_system')

    _sql_constraints = [
        ('unique_identifier', 'UNIQUE(credential_identifier)', 'The credential identifier should be unique.'),
    ]

    def init(self):
        super().init()
        if not sql.column_exists(self.env.cr, self._table, 'public_key'):
            self.env.cr.execute(SQL('ALTER TABLE %s ADD COLUMN public_key varchar', SQL.identifier(self._table)))

    def unlink(self):
        for passkey in self:
            _logger.info(
                "Passkey (#%d) deleted by %s (#%d) from %s",
                passkey.id,
                self.env.user.login, self.env.user.id,
                request.httprequest.environ['REMOTE_ADDR'] if request else 'n/a'
            )
        return super().unlink()

    def _compute_public_key(self):
        query = 'SELECT public_key FROM %s WHERE id = %s'
        for passkey in self:
            self.env.cr.execute(SQL(query, SQL.identifier(self._table), passkey.id))
            public_key = self.env.cr.fetchone()[0]
            passkey.public_key = public_key

    def _inverse_public_key(self):
        pass

    @api.model
    def _start_auth(self):
        assert request
        authentication_options = json.loads(options_to_json(generate_authentication_options(
            rp_id=url_parse(self.get_base_url()).host,
            user_verification=UserVerificationRequirement.REQUIRED,
        )))
        request.session['webauthn_challenge'] = authentication_options['challenge']
        return authentication_options

    @api.model
    def _verify_auth(self, auth, public_key, sign_count):
        parsed_url = url_parse(self.get_base_url())
        auth_verification = verify_authentication_response(
            credential=auth,
            expected_challenge=base64url_to_bytes(request.session.pop('webauthn_challenge')),
            expected_origin=parsed_url.replace(path='').to_url(),
            expected_rp_id=parsed_url.host,
            credential_public_key=base64url_to_bytes(public_key),
            credential_current_sign_count=sign_count,
        )
        return auth_verification.new_sign_count

    @api.model
    def _start_registration(self):
        assert request
        registration_options = json.loads(options_to_json(generate_registration_options(
            rp_id=url_parse(self.get_base_url()).host,
            rp_name='Odoo',
            user_id=str(self.env.user.id).encode(),
            user_name=self.env.user.login,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED
            )
        )))
        request.session['webauthn_challenge'] = registration_options['challenge']
        return registration_options

    @api.model
    def _verify_registration_options(self, registration):
        parsed_url = url_parse(self.get_base_url())
        verification = verify_registration_response(
            credential=registration,
            expected_challenge=base64url_to_bytes(request.session.pop('webauthn_challenge')),
            expected_origin=parsed_url.replace(path='').to_url(),
            expected_rp_id=parsed_url.host,
        )
        return {
            'credential_id': verification.credential_id,
            'credential_public_key': verification.credential_public_key,
        }

    @check_identity
    def action_delete_passkey(self):
        for key in self:
            if key.create_uid.id == self.env.user.id:
                # Force to go through `res.users.auth_passkey_key_ids` to trigger the session token cache invalidation
                # See `res.users.write` and `_get_invalidation_fields`
                # `self.env.user` is already sudo, so no need to re-apply `sudo` to get delete access right.
                self.env.user.write({'auth_passkey_key_ids': [Command.delete(key.id)]})
        # Reload the web client, as its session has been invalidated, following a change of session token.
        return {'type': 'ir.actions.client', 'tag': 'reload'}

    def action_rename_passkey(self):
        return {
            'name': _('Rename Passkey'),
            'type': 'ir.actions.act_window',
            'res_model': 'auth.passkey.key',
            'view_id': self.env.ref('auth_passkey.auth_passkey_key_rename').id,
            'view_mode': 'form',
            'target': 'new',
            'res_id': self.id,
            'context': {
                'dialog_size': 'medium',
            }
        }


class PassKeyName(models.TransientModel):
    _name = 'auth.passkey.key.name'
    _description = 'Passkey Name'

    name = fields.Char('Name', required=True)

    @check_identity
    def make_key(self, registration=None):
        # We add in these fields with JS, if we didn't give them default values we would get a XML validation warning.
        if registration:
            self.ensure_one()
            verification = request.env['auth.passkey.key']._verify_registration_options(registration)
            # Force to go through `res.users.auth_passkey_key_ids` to trigger the session token cache invalidation
            # See `res.users.write` and `_get_invalidation_fields`
            # `self.env.user` is already sudo, so no need to re-apply `sudo` to get create access right.
            self.env.user.write({'auth_passkey_key_ids': [Command.create({
                'name': self.name,
                'credential_identifier': verification['credential_id'].hex(),
            })]})
            passkey = self.env.user.auth_passkey_key_ids[0]
            self.env.cr.execute(SQL(
                "UPDATE %s SET public_key = %s WHERE id = %s",
                SQL.identifier(self.env['auth.passkey.key']._table),
                base64.urlsafe_b64encode(verification['credential_public_key']).decode(),
                passkey.id,
            ))
            ip = request.httprequest.environ['REMOTE_ADDR'] if request else 'n/a'
            _logger.info(
                "Passkey (#%d) created by %s (#%d) from %s",
                passkey.id,
                self.env.user.login, self.env.user.id,
                ip
            )
            # Reload the web client, as its session has been invalidated, following a change of session token.
            return {'type': 'ir.actions.client', 'tag': 'reload'}
