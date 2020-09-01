# Part of Odoo. See LICENSE file for full copyright and licensing details.
import datetime
import logging
import traceback

from odoo import api, exceptions, fields, models
from odoo.fields import Domain
from odoo.modules.registry import Registry
from odoo.tools import SQL
from odoo.tools.constants import GC_UNLINK_LIMIT
from odoo.tools.misc import is_list_of

_logger = logging.getLogger(__name__)
DEFAULT_TOPIC = 'default'


class IrAsync(models.Model):
    _name = 'ir.async'
    _description = 'Asynchronous Jobs'
    _order = 'topic, scheduled_date, id'

    topic = fields.Char(
        required=True, default=DEFAULT_TOPIC,
        help="Multiple CRON jobs can process different topics")
    state = fields.Selection([
        ('ready', 'Ready'),            # The job has been enqueued for later processing
        ('done', 'Done'),              # The job finished
        ('rejected', 'Rejected'),      # The job execution was rejected
    ], required=True, default='ready')
    # job can be scheduled to be ran in the future
    # this is also used to reschedule a failed job
    scheduled_date = fields.Datetime(required=True, default=fields.Datetime.now)
    failure_count = fields.Integer()
    error = fields.Text()
    result = fields.Json()

    # XXX server action: good or bad idea?
    server_action_id = fields.Many2one('ir.actions.server', required=True, ondelete='cascade')
    res_ids = fields.Json(required=True)
    user_id = fields.Many2one('res.users', string='Scheduler User', ondelete='cascade')
    # XXX other fields?
    # precondition = fields.Char()  # add on server action
    # single_run = fields.Boolean()  # don't retry on failures
    # special_queue = fields.Boolean()  # instead of topic
    # keep = fields.Boolean()  # prevent vacuum for deduplication (or datetime)

    current_state = fields.Selection([
        ('ready', 'Ready'),
        ('done', 'Done'),
        ('rejected', 'Rejected'),
        ('executing', 'Executing'),  # when locked for processing
        ('error', 'Error and ready'),  # when ran, ready and waiting
    ], compute='_compute_current_state')

    _schedule_index = models.Index("(topic, scheduled_date, id) WHERE state = 'ready'")
    _similar_job_index = models.Index("(server_action_id, res_ids)")

    @api.depends('server_action_id', 'res_ids')
    def _compute_display_name(self):
        for job in self:
            job.display_name = f"[{job.id}] {job.server_action_id.display_name} on {str(job.res_ids)[:20]}"

    @api.depends('state', 'error')
    def _compute_current_state(self):
        records = self.try_lock_for_update(allow_referencing=True)
        if executing := self - records:
            executing.current_state = 'executing'
        if error := records.filtered(lambda r: r.state == 'ready' and r.error):
            error.current_state = 'error'
            records -= error
        for rec in records:
            rec.current_state = rec.state

    @api.model
    def schedule(self, action, res_ids: int | list[int], *, topic=DEFAULT_TOPIC, at: datetime.datetime | None = None, postcommit: bool = False, deduplicate: bool = False):
        assert action._name == 'ir.actions.server'
        vals = {
            'server_action_id': action.id,
            'res_ids': res_ids,
            'topic': topic,
        }
        if not self.env.su:
            vals['user_id'] = self.env.uid
        if deduplicate and (job := self.sudo().search(Domain.AND(Domain(key, '=', val) for key, val in vals.items()))):
            return job
        if at is not None:
            assert isinstance(at, datetime.datetime)
            vals['scheduled_date'] = at
        job = self.sudo().create(vals)
        if postcommit:
            extra_domain = Domain('id', 'in', job.ids)
            db_name = self.env.cr.dbname

            @self.env.cr.postcommit.add
            def async_in_post_commit():
                with Registry(db_name).cursor() as cr:
                    ir_async = api.Environment(cr, api.SUPERUSER_ID, {})['ir.async']
                    ir_async._process_commit_async(extra_domain=extra_domain)
        elif topic == DEFAULT_TOPIC:
            self.env.ref('base.async_default_job')._trigger(at)
        return job

    def reject(self, reason: str) -> None:
        jobs = self.sudo()
        if not self.env.su and not all(j.user_id.id == self.env.uid for j in jobs):
            raise exceptions.AccessError("No access to async jobs")
        jobs = jobs.filtered(lambda j: j.state == 'ready')
        jobs.write({'state': 'rejected', 'error': reason})
        jobs.flush_recordset()
        for job in jobs:
            job._notify_state('rejected')

    def _process_commit_async(self, *, extra_domain=Domain.TRUE, topic=DEFAULT_TOPIC):
        assert self.env.uid == api.SUPERUSER_ID, "Can only run as SUPERUSER"
        now = fields.Datetime.now()
        job_domain = Domain(extra_domain) & Domain('state', '=', 'ready') & Domain('topic', '=', topic) & Domain('scheduled_date', '<=', now)
        env = self.env
        commit_progress = env['ir.cron']._commit_progress
        sql_select = self._search(job_domain).select()
        sql_select = SQL("%s FOR UPDATE SKIP LOCKED LIMIT 1", sql_select)

        _logger.info("Start processing async [%s]", topic)
        continue_process = True
        while continue_process:
            row = env.execute_query(sql_select)
            if not row:
                break
            job = self.browse(row[0][0])
            # run the job (and flush it)
            try:
                # XXX savepoint to avoid relocking, or separate cursor?
                job._notify_state('prepare')
                if job.user_id:
                    job = job.with_env(job.env(user=job.user_id, context={}, su=False))
                else:
                    assert job.env.uid == api.SUPERUSER_ID, "Can run async job only as SUPERUSER"
                    job = job.with_context({})
                records = job._get_records_to_process()
                if job.state == 'ready':
                    job._notify_state('start')
                    result = job._process_records(records)
                    job.result = result or None
                    job.state = 'done'
                    env.flush_all()
                    job._notify_state('done')
            except Exception as e:  # noqa: BLE001
                env.cr.rollback()
                job._handle_exception(e)
                env.flush_all()
                job._notify_state('error')
            # complete and commit the job
            try:
                job._notify_state('completed')
                continue_process = commit_progress(1)
            except Exception as e:  # noqa: BLE001
                env.cr.rollback()
                job._handle_exception(e)
                continue_process = commit_progress(1)

        if not continue_process and self.env.context.get('ir_cron'):
            commit_progress(remaining=self.search_count(job_domain))
        _logger.info("End processing async [%s]", topic)

    def _notify_state(self, state):
        _logger.debug("[%d] state: %s", self.id, state)

    def _get_records_to_process(self):
        # XXX check precondition
        # XXX optinally, dedeuplicate: prevent creating or running same job twice (like sending e-mail)
        job = self.ensure_one()
        assert job.state == 'ready', "Trying to start a non-ready job"

        # instantiate records
        ids = job.res_ids
        assert isinstance(ids, int) or is_list_of(ids, int), "Invalid type for res_ids"
        records = self.env[job.server_action_id.model_name].browse(ids)

        # check if records exist and lock them
        # XXX optional locking?
        locked_records = records.try_lock_for_update(allow_referencing=True)
        if locked_records != records:
            existing_records = records.exists()
            if existing_records != records:
                if existing_records:
                    self.reject("Some records were deleted")
                else:
                    self.reject("All records were deleted")
                return existing_records
            raise exceptions.LockError(f"Could not lock all the records for {self.id}")

        return records

    def _process_records(self, records):
        action = self.ensure_one().server_action_id
        result = action.with_context(active_model=records._name, active_id=records.id if len(records) == 1 else None, active_ids=records.ids).run()
        return result

    def _handle_exception(self, exception):
        # the job may no longer be locked!
        try:
            self.ensure_one().lock_for_update()
        except exceptions.LockError:
            _logger.error("[%d] Failed to re-lock the job during exception handling", self.id, exc_info=exception)
            return

        prev_error = self.error
        this_error = traceback.print_exception(exception)
        self.error = this_error + ('\n\n--- Previous:\n' + prev_error if prev_error else '')

        if self.state == 'ready':
            # on error, reschedule for later
            # XXX type of backoff?
            self.scheduled_date = fields.Datetime.now() + datetime.timedelta(seconds=5 + 2 ** self.failure_count)
            self.failure_count += 1

        level = logging.WARNING if isinstance(exception, exceptions.UserError) else logging.ERROR
        _logger.log(level, "[%d] Failed to process async job", self.id, exc_info=exception)

    @api.model
    def _vacuum_domain(self):
        before = fields.Datetime.now() - datetime.timedelta(days=3)
        return Domain('state', 'in', ['done', 'rejected']) & Domain('write_date', '<', before)

    @api.autovacuum
    def _vacuum_terminated_tasks(self):
        records = self.search(self._vacuum_domain(), order='id', limit=GC_UNLINK_LIMIT)
        records.unlink()
        return len(records), len(records) == GC_UNLINK_LIMIT  # done, remaining
