from odoo.addons.base_automation.controllers.webhook import WebhookController
from odoo.http import request, route


class TestWebhookController(WebhookController):
    @route()
    def call_webhook_http(self, rule_uuid, rules=None, **kwargs):
        if not rules:
            rules = []
        rules.append(request.env['webhook.mixin.test'].sudo().search([('webhook_uuid', '=', rule_uuid)]))
        rules.append(request.env['webhook.mixin.test.2'].sudo().search([('webhook_uuid', '=', rule_uuid)]))
        return super().call_webhook_http(rule_uuid, rules, **kwargs)
