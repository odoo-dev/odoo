from odoo import fields, models


class LearningPracticeCard(models.Model):
    """A deliberately tiny record used to learn the basic actions (create,
    save, discard, duplicate, archive) before meeting the real screens."""

    _name = 'learning.practice.card'
    _description = "Practice Card"
    _order = 'id desc'

    name = fields.Char(string="Name", required=True)
    date = fields.Date(string="Date", default=fields.Date.context_today)
    kind = fields.Selection(
        string="Kind",
        selection=[('idea', "Idea"), ('task', "Task"), ('note', "Note")],
        default='note',
    )
    done = fields.Boolean(string="Done")
    image = fields.Image(string="Picture", max_width=512, max_height=512)
    active = fields.Boolean(default=True)
    user_id = fields.Many2one('res.users', string="Owner", required=True, index=True, ondelete='cascade', default=lambda self: self.env.user)

    def copy_data(self, default=None):
        # Make the copy recognisable: the "Make a copy" lesson asks to rename it.
        vals_list = super().copy_data(default=default)
        if not default or 'name' not in default:
            for card, vals in zip(self, vals_list):
                vals['name'] = self.env._("%s (copy)", card.name)
        return vals_list
