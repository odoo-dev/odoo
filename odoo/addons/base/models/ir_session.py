from datetime import timedelta, datetime
from odoo import api, fields, models


class IrSession(models.Model):
    _name = 'ir.session'
    _description = "Web sessions"

    sid = fields.Char('sid', required=True, index=True)
    data = fields.Text('data', required=True)
    write_date = fields.Datetime("Last Updated On", readonly=True, index=True)

    _sql_constraints = [
        ('sid_uniq', 'unique (sid)', 'The session id must be unique.')
    ]

    @api.autovacuum
    def _remove_old_sessions(self):
        self.env.cr.execute("""
            DELETE FROM ir_session
            WHERE write_date < %s
        """, [datetime.utcnow() - timedelta(days=90)])
