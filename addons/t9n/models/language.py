from odoo import fields, models


class Language(models.Model):
    _name = "t9n.language"
    _description = "Language"

    name = fields.Char("Language", required=True)
