from odoo import fields, models

class ResUsers(models.Model):
    _inherit = 'res.users'

    stripe_credit_card_ids = fields.One2many(related="employee_id.stripe_credit_card_ids", groups="hr.group_hr_user")
