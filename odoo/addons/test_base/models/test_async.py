from ast import literal_eval

from odoo import api, fields, models


class TestOrmAsync(models.Model):
    _name = 'test_orm.async'
    _description = 'Test ORM Async Job'

    result = fields.Text()
    state = fields.Selection([
        ('todo', 'Ready'),
        ('done', 'Done'),
        ('cancel', 'Cancelled'),
        ('error', 'Error'),
    ], default='todo', required=True)
    precondition = fields.Char()
    error_count = fields.Integer()

    _process_item_precondition = [('state', '=', 'todo')]

    def _process_item(self):
        self.ensure_one()
        precondition = literal_eval(self.precondition or '[]')
        if self.filtered_domain(precondition):
            self.result = 'precondition not met'
            self.state = 'cancel'
        self.result = self.display_name
        self.state = 'done'

    def _process_item_error_handler(self, e):
        for r in self:
            r.error_count += 1
        self.result = str(e)
        self.filtered(lambda: r.error_count >= 5).state = 'error'

    def _cron_process(self):
        api.process_cron_impl(self, '_process_item')

    def test_xxx(self):
        model = self
        rec = model.create({})
        api.process.run_try_now(rec, '_process_item')
