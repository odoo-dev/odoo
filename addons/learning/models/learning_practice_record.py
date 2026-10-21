import logging

from odoo import api, fields, models
from odoo.tools import mute_logger

_logger = logging.getLogger(__name__)

# Practice records are deleted in order (see `_cleanup_rank`). Deleting can
# still fail when they depend on each other in unforeseen ways: retry a few
# rounds, then archive.
CLEANUP_ROUNDS = 3
DEFAULT_CLEANUP_RANK = 50


class LearningPracticeRecord(models.Model):
    """Registry of the real records (products, categories, ...) created for or
    during a lesson, so they can be labelled "Practice" and cleaned up."""

    _name = 'learning.practice.record'
    _description = "Practice Record"
    _order = 'id desc'

    res_model = fields.Char(string="Model", required=True, index=True)
    res_id = fields.Many2oneReference(string="Record", model_field='res_model', required=True)
    user_id = fields.Many2one('res.users', string="Learner", required=True, index=True, ondelete='cascade', default=lambda self: self.env.user)

    _unique_record = models.Constraint(
        "UNIQUE(res_model, res_id)",
        "A record can only be registered once as practice.",
    )

    @api.model
    def register(self, res_model, res_ids):
        known = set(self.search([('res_model', '=', res_model), ('res_id', 'in', res_ids)]).mapped('res_id'))
        self.create([{'res_model': res_model, 'res_id': res_id} for res_id in res_ids if res_id not in known])
        return True

    @api.model
    def register_recent(self, res_model, since):
        """Register the records of ``res_model`` the current user created since
        ``since`` (the start of a lesson step), e.g. categories created on the fly."""
        records = self.env[res_model].with_context(active_test=False).search([
            ('create_uid', '=', self.env.uid),
            ('create_date', '>=', since),
        ])
        return self.register(res_model, records.ids)

    @api.model
    def get_practice_ids(self, res_model):
        return self.search([('res_model', '=', res_model)]).mapped('res_id')

    @api.model
    def cleanup(self):
        """Remove the current user's practice records (graduation).

        :return: how many practice records were removed
        """
        entries = self.search([('user_id', '=', self.env.uid)])
        cards = self.env['learning.practice.card'].with_context(active_test=False).search([('user_id', '=', self.env.uid)])
        count = len(entries) + len(cards)
        entries._cleanup()
        cards.unlink()
        return count

    @api.model
    def _cleanup_rank(self, res_model):
        """Deletion order of practice records: lower first. Documents come
        before what they use (an order before its customer, a journal before
        its account). Modules adding lessons override it for their models."""
        return DEFAULT_CLEANUP_RANK

    def _cleanup(self):
        # most recent first within a model: what was created later usually
        # depends on what was created before
        pending = self.sorted(lambda entry: (self._cleanup_rank(entry.res_model), -entry.id))
        for _round in range(CLEANUP_ROUNDS):
            failed = self.browse()
            for entry in pending:
                record = self.env[entry.res_model].sudo().browse(entry.res_id).exists()
                try:
                    # a failure is expected and handled: keep it out of the logs
                    with self.env.cr.savepoint(), mute_logger('odoo.sql_db'):
                        record.unlink()
                except Exception:  # noqa: BLE001 - any failure is retried, then archived
                    failed |= entry
            (pending - failed).unlink()
            pending = failed
            if not pending:
                return
        for entry in pending:
            record = self.env[entry.res_model].sudo().browse(entry.res_id).exists()
            try:
                with self.env.cr.savepoint(), mute_logger('odoo.sql_db'):
                    record.active = False
            except Exception:  # noqa: BLE001 - no "active" field, or archiving refused
                _logger.warning("Could not remove practice record %s(%s)", entry.res_model, entry.res_id)
        pending.unlink()
