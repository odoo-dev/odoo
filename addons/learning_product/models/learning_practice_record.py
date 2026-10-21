from odoo import models

# Products before the categories they are in.
CLEANUP_RANKS = {
    'product.template': 40,
    'product.category': 60,
}


class LearningPracticeRecord(models.Model):
    _inherit = 'learning.practice.record'

    def _cleanup_rank(self, res_model):
        return CLEANUP_RANKS.get(res_model) or super()._cleanup_rank(res_model)
