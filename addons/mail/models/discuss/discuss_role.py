from odoo import fields, models


class DiscussRole(models.Model):
    _description = "Role in Discuss"

    name = fields.Char(required=True, translate=True)
    # user_ids = fields.Many2many("res.users", string="Users")
