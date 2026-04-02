# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _send_notification_online_payment_status(self, status):
        self.config_id._notify("ONLINE_PAYMENT_STATUS", {
            'status': status,  # progress, success, fail
            'data': {
                'pos.order': self.read(self._load_pos_self_data_fields(self.config_id), load=False),
                'pos.payment': self.payment_ids.read(self.payment_ids._load_pos_self_data_fields(self.config_id), load=False),
            },
        })
