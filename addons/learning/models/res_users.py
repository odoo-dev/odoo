from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    learning_mode = fields.Boolean(string="Learning Mode")
    # New users are greeted with the learning mode offer on their first login.
    learning_offer_pending = fields.Boolean(string="Learning Mode Offer Pending", default=True)

    @api.model
    def switch_learning_mode(self, val):
        user = self.env.user.sudo()
        group = self.env.ref('learning.group_learning_mode')
        user.write({
            'learning_mode': val,
            'learning_offer_pending': False,
            'group_ids': [(4 if val else 3, group.id)],
        })
        return user.learning_mode

    @api.model
    def dismiss_learning_offer(self):
        self.env.user.sudo().learning_offer_pending = False
        return True
