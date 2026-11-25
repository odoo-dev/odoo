# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class MrpProduction(models.Model):
    """ Reschedule the manufacturing orders when the orders to process change. """
    _inherit = 'mrp.production'

    def action_confirm(self):
        res = super().action_confirm()
        self._reschedule()
        return res

    def action_cancel(self):
        res = super().action_cancel()
        self._reschedule()
        return res

    def button_mark_done(self):
        res = super().button_mark_done()
        self._reschedule()
        return res
