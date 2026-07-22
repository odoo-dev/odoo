# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route, Controller
from odoo.addons.base_automation.models.base_automation import get_webhook_request_payload


class WebhookController(Controller):

    @route('/web/hook/<string:rule_uuid>', type='http', auth='public', methods=['GET', 'POST'], csrf=False, save_session=False)
    def call_webhook_http(self, rule_uuid, rules=None, **kwargs):
        """
        Execute automation webhooks
        Override this controller to append rules that may be linked to other models inheriting from WebhookMixin to the rules argument
        A savvy database admin is able to have several webhooks triggered at the same time if they share an UUID!
        Be careful that the payload must be valid for each webhook triggered in this way...
        """
        rules = rules or []
        rules = [rule for rule in rules if rule]  # remove empty rules
        if not rules:
            return request.make_json_response({'status': 'error'}, status=404)

        data = get_webhook_request_payload()
        try:
            for rule in rules:
                for webhook in rule:
                    webhook._execute_webhook(data)
        except Exception:  # noqa: BLE001
            return request.make_json_response({'status': 'error'}, status=500)
        return request.make_json_response({'status': 'ok'}, status=200)
