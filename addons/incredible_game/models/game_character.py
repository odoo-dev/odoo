from odoo import models, fields

class GameCharacter(models.Model):
    _name = 'game.character'
    _description = 'Game Character'

    name = fields.Char(string="Character Name", required=True)
    new_points = fields.Integer(string="Experience new_points", default=0)
    level = fields.Integer(string="Level")
    strength = fields.Integer(string="Strength")

    weapon_ids = fields.Many2many(comodel_name='game.weapon', string="Weapons")

    def level_up(self):
        """Level up the character if they have enough XP."""
        if self.new_points >= 100:
            self.level += 1
            self.new_points -= 100
            return True
        return False
