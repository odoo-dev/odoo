from datetime import datetime

from odoo import _
from odoo.http import request
from odoo.addons.point_of_sale.controllers.main import PosController as BasePosController


class PosController(BasePosController):

    def _get_invoice(self, partner_values, invoice_values, pos_order, additional_invoice_fields, kwargs):
        try:
            result = super()._get_invoice(partner_values, invoice_values, pos_order, additional_invoice_fields, kwargs)
            return result
        except Exception as e:
            if str(e) == _("You can only invoice orders created in the current month."):
                return request.render("point_of_sale.ticket_request_with_code", {
                    'errors': {'date_order': str(e)},
                    'banner_error': str(e),
                    'form_values': {
                        'pos_reference': pos_order.pos_reference[6:],
                        'date_order': datetime.date(pos_order.date_order),
                        'ticket_code': pos_order.ticket_code,
                    },
                })
            else:
                raise
