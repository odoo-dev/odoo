from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        result = super().session_info()
        if self.env.user._is_internal():
            result['learning_mode'] = self.env.user.learning_mode
            result['learning_offer_pending'] = self.env.user.learning_offer_pending
        return result
