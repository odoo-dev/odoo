from odoo import fields, models


class TestAsyncQueue(models.Model):
    _name = 'test_new_api.async.queue'
    _description = 'test_new_api.async.queue'
    _inherit = ['ir.async.job']

    processed = fields.Integer()
    active = fields.Boolean(default=True)

    def _process_async_job(self):
        self.processed += 1
