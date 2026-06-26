# Part of Odoo. See LICENSE file for full copyright and licensing details.
from collections import defaultdict

from odoo import models
from odoo.exceptions import AccessError
from odoo.http import request
from odoo.http.session import check
from odoo.tools.misc import OrderedSet

from odoo.addons.bus.bus_dispatcher import dispatch
from odoo.addons.bus.models.bus import channel_with_db
from odoo.addons.bus.websocket import wsrequest

_FORM_WATCH_PREFIX = "web.form_watch:"


class IrWebsocket(models.AbstractModel):
    _name = 'ir.websocket'
    _description = 'websocket message handling'

    def _filter_watchable_records(self, channels):
        out_channels = []
        model_name2ids = defaultdict(list)
        for channel in channels:
            if isinstance(channel, str) and channel.startswith(_FORM_WATCH_PREFIX):
                try:
                    suffix = channel[len(_FORM_WATCH_PREFIX):]
                    model_name, record_id = suffix.rsplit(":", 1)
                    if isinstance(self.env.get(model_name), self.pool['web.form.record.watch.mixin']):
                        model_name2ids[model_name].append(int(record_id))
                except (KeyError, ValueError):
                    continue
            else:
                out_channels.append(channel)
        for model_name, ids in model_name2ids.items():
            try:
                records = self.env[model_name].search([('id', 'in', ids)])  # check for existence and access
            except AccessError:
                continue
            out_channels.extend(records.mapped(lambda r: f"{_FORM_WATCH_PREFIX}{r._name}:{r.id}"))
        return out_channels

    def _build_bus_channel_list(self, channels):
        """
            Return the list of channels to subscribe to. Override this
            method to add channels in addition to the ones the client
            sent.

            :param channels: The channel list sent by the client.
        """
        channels = self._filter_watchable_records(channels)
        req = request or wsrequest
        channels.append('broadcast')
        channels.extend(self.env.user.all_group_ids)
        if req.session.uid:
            channels.append(self.env.user.partner_id)
            channels.append(self.env.user)
        return channels

    def _serve_ir_websocket(self, event_name, data):
        """Process websocket events.
        Modules can override this method to handle their own events. But overriding this method is
        not recommended and should be carefully considered, because at the time of writing this
        message, Odoo.sh does not use this method. Each new event should have a corresponding http
        route and Odoo.sh infrastructure should be updated to reflect it. On top of that, the
        event processing is very time, ressource and error sensitive."""

    def _prepare_subscribe_data(self, channels, last):
        """
        Parse the data sent by the client and return the list of channels
        and the last known notification id. This will be used both by the
        websocket controller and the websocket request class when the
        `subscribe` event is received.

        :param typing.List[str] channels: List of channels to subscribe to sent
            by the client.
        :param int last: Last known notification sent by the client.

        :return:
            A dict containing the following keys:
            - channels (set of str): The list of channels to subscribe to.
            - last (int): The last known notification id.

        :raise ValueError: If the list of channels is not a list of strings.
        """
        if not all(isinstance(c, str) for c in channels):
            e = "bus.Bus only string channels are allowed."
            raise ValueError(e)
        # sudo - bus.bus: reading non-sensitive last bus id.
        if not isinstance(last, int) or last > self.env["bus.bus"].sudo()._bus_last_id():
            last = 0
        return {
            "channels": OrderedSet(
                channel_with_db(self.env.cr.dbname, c)
                for c in self._build_bus_channel_list(list(channels))
            ),
            "last": last,
        }

    def _subscribe(self, og_data):
        data = self._prepare_subscribe_data(og_data["channels"], og_data["last"])
        # sudo - bus.bus: checking if last received notification still exists is acceptable.
        if og_data["check_outdated"] and not self.env["bus.bus"].sudo().search(
            [("id", "=", og_data["last"])],
        ):
            wsrequest.ws.send_worker_internal_message("bus/subscription_outdated")
        if og_data["last"] != data["last"]:
            # Last was outdated, ask the worker to update its local state to the last
            # known server id.
            wsrequest.ws.send_worker_internal_message(
                "bus/last_id_reset",
                self.env["bus.bus"].sudo()._bus_last_id(),
            )
        dispatch.subscribe(data["channels"], data["last"], wsrequest.ws)

    def _on_websocket_closed(self, cookies):
        """Function invoked upon WebSocket termination.
        Modules can override this method to add custom behavior."""

    @classmethod
    def _authenticate(cls):
        if wsrequest.session.uid is not None:
            check(wsrequest.session, wsrequest)
        else:
            public_user = wsrequest.env.ref('base.public_user')
            wsrequest.update_env(user=public_user.id)
