from odoo import fields, models


class LearningPracticeCardLine(models.Model):
    """A line of a practice card's to-do list: the simplest list inside a
    record, to learn how lines work before meeting quote lines."""

    _name = 'learning.practice.card.line'
    _description = "Practice Card Line"
    _order = 'sequence, id'

    card_id = fields.Many2one('learning.practice.card', required=True, index=True, ondelete='cascade')
    sequence = fields.Integer(default=10)
    name = fields.Char(string="To do", required=True)
    quantity = fields.Integer(string="Quantity", default=1)
    done = fields.Boolean(string="Done")
