# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.http import request
from werkzeug.urls import url_quote


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'
    



    def generate_qr_codes_page(self):
        """
        Generate the data needed to print the QR codes page
        """
        # TODO :replace with self.env
        business_url = request.env['ir.config_parameter'].sudo(
        ).get_param('web.base.url')
        no_of_qr_codes_per_page = 9
        qr_codes_to_print = [{
            'id': 0,
            'url': url_quote(f"{business_url}/menu?pos_id={self.pos_config_id.id}"),
        } for i in range(0, no_of_qr_codes_per_page)]
        data = {
            'pos_name': self.pos_config_id.name,
            'groups_of_tables': splitListIntoNLists(qr_codes_to_print, no_of_qr_codes_per_page),
        }
        return self.env.ref('pos_self_order.report_self_order_qr_codes_page').report_action([], data=data)


def splitListIntoNLists(l, n):
    """
    Split a list into n lists
    :param l: list to split
    :type l: list
    :param n: number of lists to split into
    :type n: int
    :return: list of lists
    """
    return [l[i:i + n] for i in range(0, len(l), n)]
