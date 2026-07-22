from odoo.addons.base_automation.controllers.webhook import WebhookController
from odoo.http import request, route


class BaseAutomationController(WebhookController):
    @route()
    def call_webhook_http(self, rule_uuid, rules=None, **kwargs):
        rules = rules or []
        rules.append(request.env['base.automation'].sudo().search([('webhook_uuid', '=', rule_uuid)]))
        return super().call_webhook_http(rule_uuid, rules, **kwargs)
