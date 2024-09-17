import time

from odoo import models
from odoo.http import request, root
from odoo.addons.bus.websocket import wsrequest
from odoo.addons.bus.models.bus_presence import AWAY_TIMER


class IrWebsocket(models.AbstractModel):
    _inherit = ['ir.websocket']

    def _update_bus_presence(self, inactivity_period, im_status_ids_by_model):
        super()._update_bus_presence(inactivity_period, im_status_ids_by_model)
        req = request or wsrequest
        if req:
            self._set_next_check_identity(req.session, inactivity_period)

    def _on_websocket_closed(self, cookies):
        super()._on_websocket_closed(cookies)
        if cookies.get('session_id'):
            session = root.session_store.get(cookies['session_id'])
            self._set_next_check_identity(session)

    def _set_next_check_identity(self, session, inactivity_period=None):
        now = time.time()
        if self.env.user and not self.env.user._is_public() and (
            not session.get('next-check-identity') or session['next-check-identity'] > now
        ):
            if inactivity_period is None:
                # Special case of the websocket disconnect: means the user has no more open tab on Odoo.
                # Ask for authentication after delay
                session['next-check-identity'] = now + AWAY_TIMER
            elif inactivity_period / 1000 > AWAY_TIMER:
                # The user is inactive for more than the allowed delay, ask for authentication now
                session['next-check-identity'] = now
            elif session.get('next-check-identity'):
                # The user is inactive for less than the delay allowed, remove any re-authentication delay
                # e.g. when the user closes all tabs on odoo then re-opens one within the allowed delay.
                del session['next-check-identity']
            # save manually because a websocket request doesn't support automatic save of changes in the session
            # as a normal request does. `update_presence` is called via a websocket request.
            root.session_store.save(session)
