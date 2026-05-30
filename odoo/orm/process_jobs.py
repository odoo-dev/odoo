from __future__ import annotations

import contextlib
import logging
import time
import typing
from contextvars import ContextVar

from odoo.tools import SQL, OrderedSet, split_every

from .domains import Domain
from .environments import Environment
from .models import BaseModel
from .registry import Registry
from .utils import SUPERUSER_ID

if typing.TYPE_CHECKING:
    from collections.abc import Callable, Iterable

_logger = logging.getLogger(__name__)
EMPTY_RESOURCE = contextlib.nullcontext(None)


class ProcessingState[M: BaseModel, Resource]:
    def __init__(self, model: M, process_name: str):
        if '__' in process_name or not process_name:
            raise ValueError
        self.__process_name = process_name
        if not isinstance(model, BaseModel):
            raise TypeError
        self.__model_name = model._name

        Model = type(model)
        model = model.sudo()
        process = getattr(Model, process_name)
        assert callable(process)
        self.process: Callable[[M], None] = process
        error_handler = getattr(Model, process_name + '_error_handler')
        assert callable(error_handler)
        self.error_handler: Callable[[M, Exception], None] = error_handler

        precondition = getattr(model, process_name + '_precondition')
        if callable(precondition):
            precondition = precondition()
        precondition = Domain(precondition)
        assert not precondition.is_true()
        self.precondition = precondition

        self._cron_id = getattr(model, self.__process_name + '_cron_id')

        batch_size = getattr(model, process_name + '_batch_size', 1)
        if callable(batch_size):
            batch_size = batch_size()
        assert batch_size > 0
        self.batch_size: int = batch_size

        self.allow_referencing = bool(getattr(model, process_name + '_allow_referencing', True))
        self.order: str = getattr(model, process_name + '_order', '')
        self._resource_batcher: Callable[[M, Resource | None], Iterable[tuple[Resource | None, M]]] = (
            getattr(Model, self.__process_name + '_resources', None)
            or (lambda records, _r: [(None, records)])
        )

        # context manager variables
        self.resource: Resource | None = None
        self.resource_value = None
        self.__reset_token = None

    def __enter__(self):
        self.__reset_token = processing_state.set(self)
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc is not None:
                exc.add_note(f"failing {self.identifier}")
            self._set_resource(None, exit_args=(exc_type, exc, tb))
        finally:
            processing_state.reset(self.__reset_token)
            self.__reset_token = None

    def _set_resource(self, resource: Resource, exit_args=(None, None, None)):
        if resource is self.resource:
            return
        # exit the old resource
        self.resource_value = None
        if self.resource is not None:
            self.resource.__exit__(*exit_args)
            self.resource = None
        # enter the new resource
        if resource is not None:
            self.resource_value = resource.__enter__()  # ruff:ignore[unnecessary-dunder-call]
            self.resource = resource

    def resource_batcher(self, records: M):
        """Create batches per resource and per batch_size."""
        size = self.batch_size
        for resource, sub_records in self._resource_batcher(records, self.resource):
            self._set_resource(resource)
            # browse makes sure to set the prefetch
            yield from split_every(size, sub_records._ids, sub_records.browse)

    @property
    def identifier(self) -> str:
        return f"process:{self.__model_name}:{self.__process_name}"

    def check(self, model: BaseModel, process_name: str) -> None:
        """Get the resource of the process and check we are in the execution context"""
        if not (isinstance(model, BaseModel) and model._name == self.__model_name and process_name == self.__process_name):
            raise RuntimeError(f"Invalid records passed, expecting {self.__model_name}.{self.__process_name}")
        if self.__reset_token is None:
            raise RuntimeError(f"Not in the context of {self}")

    def get_cron(self, model: M) -> BaseModel:
        cron_id = self._cron_id
        if isinstance(cron_id, str):
            cron = model.env.ref(cron_id)
            assert cron._name == 'ir.cron', "ref is not a ir.cron"
        else:
            cron = model.env['ir.cron'].browse(cron_id).ensure_one()
        return cron.sudo()

    def _run_with_commit(self, records: BaseModel):
        self.check(records, self.__process_name)
        cron = records.env['ir.cron']
        ids = OrderedSet(records._ids)
        remaining_time = True
        while remaining_time and ids:
            records = records.browse(ids).try_lock_for_update(allow_referencing=self.allow_referencing, limit=self.batch_size)
            if not records:
                break  # failed to lock anything
            ids.difference_update(records._ids)
            records = records.filtered_domain(self.precondition)
            for records in self.resource_batcher(records):
                try:
                    self.process(records)
                    remaining_time = cron._commit_progress(len(records))
                except Exception as exception:  # noqa: BLE001
                    cron._rollback_progress()
                    self.error_handler(records, exception)
                    remaining_time = cron._commit_progress(0)
                if not remaining_time:
                    break
        return remaining_time

    def _run_in_env(self, records: BaseModel, raise_on_error: bool = False) -> int:
        self.check(records, self.__process_name)
        records = records.filtered_domain(self.precondition).try_lock_for_update(allow_referencing=self.allow_referencing)
        count = 0
        for records in self.resource_batcher(records):
            if raise_on_error:
                self.process(records)
            else:
                try:
                    with records.env.cr.savepoint():
                        self.process(records)
                except Exception as exception:  # ruff:ignore[blind-except]
                    self.error_handler(records, exception)
                    self.env.flush_all()
            count += len(records)
        return count


processing_state = ContextVar[ProcessingState]('processing_state')


class process:
    def __new__(cls):
        raise RuntimeError("process is just a namespace")

    @staticmethod
    def _get(model: BaseModel, process_name: str, *, create: bool) -> ProcessingState:
        try:
            state = processing_state.get()
            state.check(model, process_name)
        except LookupError:
            if create:
                return ProcessingState(model, process_name)
            raise RuntimeError("Trying to call directly the process function, use the process API") from None
        except RuntimeError:
            if create:
                return ProcessingState(model, process_name)
            raise
        return state

    @staticmethod
    def check(records: BaseModel, process_name: str):
        """Get the resource of the process and check we are in the execution context"""
        state = process._get(records, process_name, create=False)
        if state.batch_size == 1:
            records.ensure_one()
        return state.resource_value

    @staticmethod
    def cron_implementation(
        model: BaseModel, process_name: str, *,
        search_domain: Domain = Domain.TRUE, search_limit: int = 0, search_order: str | None = None,
        compute_remaining: bool = True,
    ):
        """Implement a cron job."""
        env = model.env
        assert env.context.get('ir_cron_progress_id'), "Only makes sense for cron jobs"
        with process._get(model, process_name, create=True) as proc:
            proc.precondition = proc.precondition.optimize_dynamic(model)
            search_domain = (Domain(search_domain) & proc.precondition).optimize_full(model)
            search_order = search_order or proc.order

            if search_limit > proc.batch_size:
                records = model.search(search_domain, limit=search_limit, order=search_order)
                if compute_remaining and records:
                    env['ir.cron']._commit_progress(remaining=(len(records) if len(records) < search_limit else model.search_count(search_domain)))
                while records:
                    remaining_time = proc._run_with_commit(records)
                    if not remaining_time:
                        break
                    records = model.search(search_domain, limit=search_limit, order_search=search_order) - records
                return

            cron = env['ir.cron']
            query = model._search(search_domain, limit=search_limit or None, order=search_order)
            if compute_remaining:
                remaining = len(query)
                cron._commit_progress(remaining=remaining)
            else:
                remaining = True
            query.limit = proc.batch_size
            if proc.allow_referencing:
                lock_sql = SQL("FOR NO KEY UPDATE SKIP LOCKED")
            else:
                lock_sql = SQL("FOR UPDATE SKIP LOCKED")
            sql = SQL("%s %s", query.select(), lock_sql)
            while remaining and (rows := model.env.execute_query(sql)):
                batch_records = model.browse(row[0] for row in rows)
                for records in proc.resource_batcher(batch_records):
                    try:
                        proc.process(records)
                        remaining = cron._commit_progress(len(records))
                    except Exception as exception:  # noqa: BLE001
                        cron._rollback_progress()
                        proc.error_handler(records, exception)
                        remaining = cron._commit_progress()
                if remaining and search_limit < proc.batch_size and batch_records.filtered_domain(proc.precondition) == batch_records:
                    # no change for records, search with bigger search batch
                    return process.cron_implementation(
                        model, process_name,
                        search_domain=search_domain, search_limit=proc.batch_size * 2, search_order=search_order,
                        compute_remaining=False,
                    )

    @staticmethod
    def run_try_now(records: BaseModel, process_name: str, *, raise_on_error: bool = False) -> int:
        """Process the queue in the current cursor."""
        with process._get(records, process_name, create=True) as proc:
            env = records.env(user=proc.get_cron(records).user_id, context={})
            return proc._run_in_env(records.with_env(env), raise_on_error=raise_on_error)

    @staticmethod
    def run_with_commit(records: BaseModel, process_name: str) -> float:
        """Process the queue in the current cursor. Return remaining time."""
        with process._get(records, process_name, create=False) as proc:
            return proc._run_with_commit(records)

    @staticmethod
    def run_post_request(records: BaseModel, process_name: str, *, max_execution_time=15) -> None:
        """Try to process the queue as soon as possible after the current transaction or let the cron do it.

        In other words, give some time to process records during ir.http.post_request.
        The cron is triggered to process jobs in case of failures.
        """
        assert max_execution_time > 0
        with process._get(records, process_name, create=True) as self:
            ids = records.filtered_domain(self.precondition).ids
            if not ids:
                return

            callbacks = records.env['ir.http'].post_request
            todo = callbacks.data.get(self.identifier)
            if todo is not None:
                todo.update(ids)
                return

            db_name = records.env.registry.db_name
            trigger_id = self.get_cron(records)._trigger(coalesce=1).id
            callbacks.data[self.identifier] = todo = OrderedSet(ids)
            end_time = time.monotonic() + max_execution_time

            def queue_in_postcommit():
                if time.monotonic() > end_time:
                    return
                records = self.identifier  # init for exception handler
                try:
                    with Registry(db_name).cursor() as cr:
                        env = Environment(cr, SUPERUSER_ID, {'end_time': end_time})
                        records = env[self.__model_name]
                        cron = self.get_cron(records)
                        records = records.browse(todo).with_user(cron.user_id)

                        with self:
                            remaining_time = self._run_with_commit(records)

                        # try to cancel the trigger
                        if trigger_id and remaining_time and not records.filtered_domain(self.precondition) and cron.try_lock_for_update(allow_referencing=True):
                            env['ir.cron.trigger'].browse(trigger_id).try_lock_for_update(allow_referencing=False).unlink()
                except Exception:
                    _logger.exception("Error in post-transaction execution for %s", records)

            callbacks.add(queue_in_postcommit)

    @staticmethod
    def run_later(records: BaseModel, process_name: str, coalesce=1):
        """Trigger the cron for a process."""
        with process._get(records, process_name, create=True) as proc:
            if not records.filtered_domain(proc.precondition):
                return None
            return proc.get_cron(records)._trigger(coalesce=coalesce)
