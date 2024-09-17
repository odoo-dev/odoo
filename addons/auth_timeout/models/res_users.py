from odoo import models


class Users(models.Model):
    _inherit = 'res.users'

    def _get_auth_methods(self):
        methods = []
        if self.auth_passkey_key_ids:
            methods.append('webauthn')
        methods.append('password')
        return methods
