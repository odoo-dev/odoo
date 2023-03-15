# -*- coding: utf-8 -*-

from odoo import models
from werkzeug.urls import url_quote


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def generate_qr_codes_page(self):
        """
        Generate the data needed to print the QR codes page
        """
        business_url = self.env['ir.config_parameter'].get_param('web.base.url')
        no_of_qr_codes_per_page = 9
        qr_codes_to_print = [{
            'id': 0,
            'url': url_quote(f"{business_url}/menu?pos_id={self.pos_config_id.id}"),
        } for i in range(0, no_of_qr_codes_per_page)]
        data = {
            'pos_name': self.pos_config_id.name,
            'tables': qr_codes_to_print,
        }
        print(data)
        return self.env.ref('pos_self_order.report_self_order_qr_codes_page').report_action([], data=data)
