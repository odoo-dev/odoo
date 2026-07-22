from odoo import fields, models


class WebhookMixinTest(models.Model):
    _name = 'webhook.mixin.test'
    _inherit = ['webhook.mixin']
    _description = 'Webhook Mixin Test Model'

    model_name = fields.Char(default='webhook.mixin.test')
    times_called = fields.Integer(default=0)

    def _process_webhook(self, records):
        records.times_called += 1


class WebhookMixinTest2(models.Model):
    _name = 'webhook.mixin.test.2'
    _inherit = ['webhook.mixin']
    _description = 'Webhook Mixin Test Model with Additional Field'

    model_name = fields.Char(default='webhook.mixin.test.2')
    was_called = fields.Boolean(default=False)
    times_called = fields.Integer(default=0)

    def _process_webhook(self, records):
        records.times_called += 1
        records.was_called = True
