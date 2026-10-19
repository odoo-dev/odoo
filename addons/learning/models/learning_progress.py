from odoo import api, fields, models


class LearningProgress(models.Model):
    """Where a user stands in one lesson. Lessons themselves are defined in
    the web client (registry ``learning.lessons``) and identified by key."""

    _name = 'learning.progress'
    _description = "Lesson Progress"
    _order = 'write_date desc'

    user_id = fields.Many2one('res.users', string="Learner", required=True, index=True, ondelete='cascade', default=lambda self: self.env.user)
    lesson_key = fields.Char(string="Lesson", required=True)
    state = fields.Selection(
        string="State",
        selection=[('running', "In progress"), ('done', "Done")],
        default='running',
        required=True,
    )
    checkpoint_key = fields.Char(string="Checkpoint")

    _unique_user_lesson = models.Constraint(
        "UNIQUE(user_id, lesson_key)",
        "A lesson is tracked once per user.",
    )

    def _get_or_create(self, lesson_key):
        progress = self.search([('user_id', '=', self.env.uid), ('lesson_key', '=', lesson_key)])
        return progress or self.create({'lesson_key': lesson_key})

    @api.model
    def checkpoint(self, lesson_key, checkpoint_key):
        """Record that the user reached a checkpoint. Replaying a finished
        lesson keeps it done.

        :return: the server time, so the web client can later find the records
            created since this checkpoint
        """
        self._get_or_create(lesson_key).checkpoint_key = checkpoint_key
        return fields.Datetime.to_string(fields.Datetime.now())

    @api.model
    def complete(self, lesson_key):
        self._get_or_create(lesson_key).write({'state': 'done', 'checkpoint_key': False})
        return True

    @api.model
    def get_state(self):
        progresses = self.search([('user_id', '=', self.env.uid)])
        return {
            'done': progresses.filtered(lambda p: p.state == 'done').mapped('lesson_key'),
            'running': {p.lesson_key: p.checkpoint_key for p in progresses if p.state == 'running'},
        }
