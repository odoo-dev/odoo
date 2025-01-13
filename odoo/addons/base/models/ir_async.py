# Part of Odoo. See LICENSE file for full copyright and licensing details.
from __future__ import annotations

import collections
import contextlib
import logging
import time
import traceback
import typing
from uuid import uuid4

from odoo import api, fields, models
from odoo.api import Environment
from odoo.fields import Domain
from odoo.modules.registry import Registry
from odoo.tools import split_every, OrderedSet
from odoo.tools.constants import PREFETCH_MAX

if typing.TYPE_CHECKING:
    from odoo.api import Self

MAX_FAIL_COUNT = 3
_logger = logging.getLogger(__name__)


class FutureResult:
    def __init__(self, record: models.BaseModel):
        self.model = record._name
        self.ids = record.ids
        assert self.ids, "No records"

    def job(self, env: Environment, *, check_ready: bool = True) -> models.BaseModel:
        jobs = env[self.model].browse(self.ids)
        if check_ready:
            jobs = jobs.filtered(lambda job: job.job_state == 'done')
            if len(jobs) != len(self.ids):
                raise ValueError(f"Job not finished {self!r}")
        return jobs

    def to_response(self, adapter=None):
        # XXX make a proper HTTP response after running the job
        from http import request  # noqa: PLC0415
        with request.registry.cursor() as cr:
            env = cr  # XXX Environment()
            job = self._execute_job(env, must_succeed=True)
            payload = job if adapter is None else adapter(job)
            return payload  # XXX return http_response(payload)

    def post_commit(self, env: Environment) -> None:
        post = env.cr.postcommit
        data = post.data.setdefault(f'{self.model}-async-execute', collections.defaultdict(OrderedSet))
        data[env.uid, env.context].update(self.ids)
        db_name = env.registry.db_name

        @data.add
        def execute_post_commit_jobs():
            data = post.data.get(f'{self.model}-async-execute')
            if not data:
                return
            with Registry(db_name).cursor() as cr:
                # XXX trigger too?
                for (uid, context), ids in data.items():
                    env = Environment(cr, uid, context)
                    jobs = env[self.model].browse(ids)
                    jobs._postcommit_process()

    def __repr__(self):
        return f"FutureResult:{self.model}.{self.id}"


class UUIDMixin(models.AbstractModel):
    _name = 'uuid.mixin'
    _description = "Model with UUID"

    uuid = fields.Char('UUID', copy=False, readonly=True)
    _uuid_unique = models.Constraint('UNIQUE (uuid)')

    def ensure_uuid(self) -> str | None:
        for job in self:
            if not job.uuid:
                job.uuid = uuid4().hex
        return self.uuid if len(self) == 1 else None


class IrAsyncJob(models.AbstractModel):
    """ Helper model to the ``@api.autovacuum`` method decorator. """
    _name = 'ir.async.job'
    _description = 'Async Job'

    _async_job_batch_size: int = 1
    _async_job_ref: str = ''  # xmlid of the cron to run this job

    job_state = fields.Selection([
        ('queued', 'Queued'),
        ('done', 'Done'),
        ('fail', 'Failed'),
        ('cancel', 'Cancelled'),
    ], default='queued', required=True, copy=False, readonly=True)
    job_duration = fields.Float(copy=False, readonly=True)
    job_error = fields.Text(copy=False, readonly=True)
    job_failed_count = fields.Integer(copy=False, readonly=True)

    def _process_async_job(self, resources) -> None:
        raise NotImplementedError('_process_async_job: abstract method')

    def _on_job_success(self) -> None:
        self.write({
            'job_state': 'done',
            'job_duration': (self.env.context.get('job_duration') or 0) / len(self),
            'job_error': False,
        })

    def _on_job_error(self, exc: Exception, state=None) -> None:
        job_duration = (self.env.context.get('job_duration') or 0) / len(self)
        error = traceback.format_exception(value=exc)
        for job in self:
            count = job.job_failed_count + 1
            if state is None:
                state = 'fail' if count >= MAX_FAIL_COUNT else 'queued'
            job.write({
                'job_state': state,
                'job_duration': job_duration,
                'job_error': error,
                'job_failed_count': count,
            })
 
    @api.model
    def _job_precondition(self) -> Domain:
        search_domain = Domain('job_state', '=', 'queued')
        if self._active_name:
            search_domain &= Domain(self._active_name, '=', True)
        return search_domain._optimize(self)

    def _job_resources(self):
        return contextlib.nullcontext()

    def _post_commit_process(self) -> None:
        self._cron_process(commit_progress=lambda _: self.env.cr.commit(), jobs=self)

    @api.model
    def _cron_process(self, *, commit_progress=None, jobs=None) -> None:
        precondition = self._job_precondition()
        if not commit_progress:
            commit_progress = self.env['ir.cron']._commit_progress
        if jobs is None:
            jobs = self.search(precondition, limit=PREFETCH_MAX)
            compute_remaining = len(jobs) == PREFETCH_MAX
            jobs = jobs.try_lock_for_update()
        else:
            assert jobs._name == self._name
            jobs = jobs.try_lock_for_update().filtered_domain(precondition)
            compute_remaining = False
        if not jobs:
            return

        _logger.debug("Async process starting to process %d jobs", len(jobs))
        done = 0
        if self._async_job_batch_size > 1:
            jobsets = split_every(self._async_job_batch_size, jobs, jobs.browse)
        else:
            jobsets = jobs
        with jobs._job_resources() as resources:
            commit_progress(remaining=self.search_count(precondition) if compute_remaining else len(jobs))
            for jobset in jobsets:
                jobset = jobset.try_lock_for_update().filtered_domain(precondition)
                if not jobset:
                    continue
                _logger.debug("Async process: %s", jobset)
                start_time = time.monotonic()
                jobset = jobset.with_context(job_start_time=start_time, job_duration=None)
                try:
                    jobset._process_async_job(resources=resources)
                    jobset.env.flush_all()
                    jobset = jobset.with_context(job_duration=time.monotonic() - start_time)
                    jobset._on_job_success()
                    should_continue = commit_progress(len(jobset))
                    done += len(jobset)
                except Exception as exc:
                    self.env.cr.rollback()
                    jobset = jobset.with_context(job_duration=time.monotonic() - start_time)
                    jobset._on_job_error(exc)
                    should_continue = commit_progress(0)
                _logger.debug("Async process done in %.2fs: %s", jobset.env.context['job_duration'], jobset)
                if not should_continue:
                    break
        _logger.debug("Async process finished %d jobs", done)
        if done == 0:
            # nothing was done, remove remaining to avoid a loop
            commit_progress(remaining=0)

    def trigger(self) -> None:
        # XXX nice API, but needed?
        if not any(job.job_state == 'queued' for job in self):
            return
        self.env.ref(self._async_job_ref)._trigger()

    def future(self) -> FutureResult:
        return FutureResult(self)

    def retry(self, include_done: bool = True) -> Self:
        jobs = self.filtered(lambda job: job.job_state != 'queued' and (include_done or job.job_state != 'done'))
        jobs.job_state = 'queued'
        return jobs

    def cancel(self) -> Self:
        jobs = self.filtered(lambda job: job.job_state == 'queued')
        jobs.job_state = 'cancel'
        return jobs
