import json
import logging

from odoo.http import Controller, request, Response, route

_logger = logging.getLogger(__name__)


class QlubNotificationController(Controller):
    @route("/qlub/<string:transaction_id>/<string:action>", type="http", auth="public", methods=["POST"], csrf=False)
    def qlub_result(self, transaction_id, action, **kwargs):
        if action not in ("result", "cancel"):
            return Response(status=404)

        raw_body = request.httprequest.get_data()
        data = json.loads(raw_body.decode("utf-8"))
        _logger.info("Qlub: Received transaction result: %s", data)

        # TODO: Do we need to verify the signature? There isn't any in the response
        try:
            [payment_uuid, config_id] = transaction_id.split('--')
        except ValueError:
            _logger.warning("Qlub: Invalid transaction_id format")
            return Response(status=400)

        pos_config_sudo = request.env['pos.config'].sudo().browse(int(config_id))
        pos_config_sudo._notify("QLUB_RESPONSE", {
            "action": action,
            'response': data,
            'line_uuid': payment_uuid,
        })

        return Response(status=200)
