from odoo import models, fields

class GameWeapon(models.Model):
    _name = 'game.weapon'
    _description = 'Game Weapon'

    name = fields.Char(string="Weapon Name", required=True)
    damage = fields.Integer(string="Damage", required=True, default=10)

    character_ids = fields.Many2many(comodel_name='game.character', string="Characters")
