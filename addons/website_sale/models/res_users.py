from odoo import models
from odoo.http import request


class ResUsers(models.Model):
    _inherit = "res.users"

    # TODO VFE add test
    def _check_credentials(self, credential, env):
        """Make all wishlists from session belong to its owner user."""
        result = super()._check_credentials(credential, env)
        if request and request.session.get("wishlist_ids"):
            self.env.user.partner_id._assign_session_wishes()
        return result
