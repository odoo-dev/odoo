from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _gamification__gamification_badge_user_access = models.Ref('gamification.gamification_badge_user_access', 'ir.access', required=False)
