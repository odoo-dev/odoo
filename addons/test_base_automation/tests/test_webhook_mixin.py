import json

from odoo.tests import common, mute_logger, tagged


@tagged("post_install", "-at_install")
class TestWebhookMixinHttp(common.HttpCase):
    def test_webhook_trigger_url(self):
        [webhooks_1, webhooks_2] = self._create_self_targeting_webhooks('webhook.mixin.test', [{}, {}])

        with mute_logger('odoo.addons.base_automation.models.base_automation'):
            response = self.url_open(webhooks_1.webhook_url, data=json.dumps({}))
        self.assertEqual(response.status_code, 200)

        self.assertEqual(webhooks_1.times_called, 1)
        self.assertEqual(webhooks_2.times_called, 0)

    def test_webhook_triple_trigger(self):
        # Webhooks with matching UUIDs should all be executed on the same request even if they belong to different models
        webhook_uuid = '669933'
        specs = {
            'webhook_uuid': webhook_uuid,
        }

        [webhooks_1, webhooks_2] = self._create_self_targeting_webhooks('webhook.mixin.test', [specs, specs])
        [webhooks_3, webhooks_4] = self._create_self_targeting_webhooks('webhook.mixin.test.2', [specs, {}])
        self.assertEqual(webhooks_1.webhook_url, webhooks_2.webhook_url, 'Sanity check: URLs should be equal')
        self.assertEqual(webhooks_1.webhook_url, webhooks_3.webhook_url, 'Sanity check: URLs should be equal')

        with mute_logger('odoo.addons.base_automation.models.base_automation'):
            response = self.url_open(webhooks_1.webhook_url, data=json.dumps({}))
        self.assertEqual(response.status_code, 200)

        for webhook in [webhooks_1, webhooks_2, webhooks_3]:
            self.assertEqual(webhook.times_called, 1, 'Each webhook belonging to the same UUID was called')
        self.assertTrue(webhooks_3.was_called, 'Variable exclusive to webhook.mixin.test.2 was set')
        self.assertFalse(webhooks_4.was_called, 'Webhooks_4 had a different UUID and was not called')

    @classmethod
    def _create_self_targeting_webhooks(cls, model, specs):
        # Helper method: Returns a recordset of webhooks that get themselves
        webhooks = cls.env[model].create(specs)
        for hook in webhooks:
            hook.webhook_record_getter = f'model.browse({hook.id})'
        return webhooks
