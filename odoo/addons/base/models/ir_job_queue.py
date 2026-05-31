import ast
import datetime
import logging
import random

from odoo import api, fields, models
from odoo.fields import Domain

_logger = logging.getLogger(__name__)


class JobQueue(models.Model):
    _name = 'ir.job.queue'
    _description = "Job Queue (generic)"
    _order = 'run_at, id'

    model = fields.Char(required=True)
    method_name = fields.Char(required=True)
    args = fields.Json()
    run_at = fields.Datetime(default=lambda s: s.env.cr.now())
    precondition = fields.Char(string='Pre-Condition')
    state = fields.Selection([
        ('ready', 'Ready'),
        ('done', 'Done'),
        ('cancel', 'Cancelled'),
    ], required=True, default='ready')
    error_count = fields.Integer()
    result = fields.Text()

    _run_at_idx = models.Index("(run_at) WHERE run_at IS NOT NULL AND state = 'ready'")

    _process_job_precondition = Domain('run_at', '<=', 'now') & Domain('state', '=', 'ready')
    _process_job_cron_id = 'base.cron_job_queue'

    def _process_job(self):
        api.process.check(self, '_process_job')
        _logger.info("%s", self)
        precondition = Domain(ast.literal_eval(self.precondition or '[]'))
        ids, *args = self.args  # XXX handle dict
        record = self.env[self.model].browse(ids)
        if record.filtered_domain(precondition):
            method_name = self.method_name
            result = getattr(record, method_name)(*args)  # XXX unsafe
            self.result = str(result)
            self.state = 'done'
        else:
            self.state = 'cancel'

    def _process_job_error_handler(self, exception):
        _logger.error("Ah...", exc_info=exception)
        error_text = str(exception)
        for job in self:
            job.error_count += 1
            job.result = error_text + ("\n----\n" + job.result if job.result else "")
            if job.error_count > 4:
                job.run_at = False
                job.state = 'cancel'
            else:
                job.run_at = self.env.cr.now() + datetime.timedelta(minutes=random.randint(job.error_count, 10))

    @api.model
    def _cron_process_queue(self, *, condition=Domain.TRUE):
        api.process.cron_implementation(
            self,
            '_process_job',
            search_domain=condition,
        )

    def _process_now(self):
        api.process.run_try_now(self, '_process_job')

    def _process_post_transaction(self, **kw):
        api.process.run_post_request(self, '_process_job', **kw)

    def dummy(self):
        return f'dummy{self}'

    def test_create_dummy(self):
        jobs = self.create([
            {'model': self._name, 'method_name': 'dummy'}
            for _ in range(2)
        ])
        for j in jobs:
            j.args = [j.id]
        return jobs

    def test_process_now(self):
        records = self.test_create_dummy()
        records._process_now()

    def test_process_post(self):
        records = self.test_create_dummy()
        records._process_post_transaction()
