# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo
import odoo.exceptions
from odoo.modules.registry import Registry


import hmac
import logging
from hashlib import sha256
from odoo.tools import SQL

_logger = logging.getLogger(__name__)


def check(db, uid, passwd):
    res_users = Registry(db)['res.users']
    return res_users.check(db, uid, passwd)

def compute_session_token(session, env):
    self = env['res.users'].browse(session.uid)
    return self._compute_session_token(session.sid)


def check_session(session, env, request=None):
    self = env['res.users'].browse(session.uid)
    expected = self._compute_session_token(session.sid)
    if expected and odoo.tools.misc.consteq(expected, session.session_token):
        if request:
            env['res.device.log']._update_device(request)
        return True
    elif 'auth.passkey.key' in env:
        def _get_session_token_fields():
            return {'id', 'login', 'password', 'active', 'totp_secret', 'oauth_access_token'}

        def _get_session_token_query_params():
            database_secret = SQL("SELECT value FROM ir_config_parameter WHERE key='database.secret'")
            fields = SQL(", ").join(
                SQL.identifier(self._table, fname)
                for fname in sorted(_get_session_token_fields())
                if not self._fields[fname].relational
            )
            return {
                "select": SQL("(%s), %s", database_secret, fields),
                "from": SQL("res_users"),
                "joins": SQL(""),
                "where": SQL("res_users.id = %s", self.id),
                "group_by": SQL("res_users.id"),
            }

        env.cr.execute(SQL(
            "SELECT %(select)s FROM %(from)s %(joins)s WHERE %(where)s GROUP BY %(group_by)s",
            **_get_session_token_query_params(),
        ))
        if env.cr.rowcount != 1:
            env.registry.clear_cache()
            return False
        data_fields = env.cr.fetchone()
        key = (u'%s' % (data_fields,)).encode('utf-8')
        data = session.sid.encode('utf-8')
        h = hmac.new(key, data, sha256)
        expected2 = h.hexdigest()
        if odoo.tools.misc.consteq(expected2, session.session_token):
            if request:
                env['res.device.log']._update_device(request)
            session.session_token = expected
            _logger.info("Upgraded session for user %s", session.uid)
            return True
    return False
