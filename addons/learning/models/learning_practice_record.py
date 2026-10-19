import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

# Deleting can fail because practice records depend on each other (e.g. a
# category still used by a practice product): retry a few rounds, then archive.
CLEANUP_ROUNDS = 3


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

    def _cleanup(self):
        pending = self
        for _round in range(CLEANUP_ROUNDS):
            failed = self.browse()
            for entry in pending:
                record = self.env[entry.res_model].sudo().browse(entry.res_id).exists()
                try:
                    with self.env.cr.savepoint():
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
                with self.env.cr.savepoint():
                    record.active = False
            except Exception:  # noqa: BLE001 - no "active" field, or archiving refused
                _logger.warning("Could not remove practice record %s(%s)", entry.res_model, entry.res_id)
        pending.unlink()
