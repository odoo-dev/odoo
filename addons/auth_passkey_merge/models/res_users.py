from odoo import models
from odoo.tools import SQL
from odoo.http import request, Session

# We only want to set new_format for brand new sessions
oldfinalize = Session.finalize
def finalize(self, env):
    self['new_format'] = True
    return oldfinalize(self, env)
Session.finalize = finalize

class UsersPasskeyMerge(models.Model):
    _inherit = 'res.users'

    def _get_session_token_fields(self):
        if not request or 'new_format' in request.session:
            return super()._get_session_token_fields()
        request.session.should_rotate = True
        request.session['new_format'] = True
        ret = super()._get_session_token_fields()
        ret.remove('auth_passkey_key_ids')
        return ret

    def _get_session_token_query_params(self):
        if not request or 'new_format' in request.session:
            return super()._get_session_token_query_params()
        params = super()._get_session_token_query_params()
        params['select'] = SQL(params['select'].code[:-40])
        params['joins'] = SQL(params['joins'].code[:-64])
        return params
