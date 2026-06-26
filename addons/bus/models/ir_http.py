# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models
from ..websocket import WebsocketConnectionHandler


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    @api.model
    def get_frontend_session_info(self):
        session_info = super().get_frontend_session_info()
        session_info["websocket_worker_version"] = WebsocketConnectionHandler._VERSION
        return session_info

    def session_info(self):
        session_info = super().session_info()
        session_info["websocket_worker_version"] = WebsocketConnectionHandler._VERSION
        return session_info

    @api.model
    def lazy_session_info(self):
        return super().lazy_session_info() | {
            'form_watchable_models': list(self.env.registry.descendants(['web.form.record.watch.mixin'], '_inherit') - {'web.form.record.watch.mixin'}),
        }
