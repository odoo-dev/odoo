from odoo import models


class GamificationGoalDefinition(models.Model):
    _inherit = 'gamification.goal.definition'

    _website_slides__badge_data_certification_goal = models.Ref('website_slides.badge_data_certification_goal', 'gamification.goal.definition', required=False)
