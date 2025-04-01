# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request

from odoo.addons.sale.controllers.portal import CustomerPortal as SaleCustomerPortal


class CustomerPortal(SaleCustomerPortal):

    @http.route(['/my/orders/<int:order_id>/download_edi'], auth="public", website=True)
    def portal_my_sale_order_download_edi(self, order_id=None, access_token=None, **kw):
        """An endpoint to download EDI file representation.
        """
        try:
            order_sudo = self._document_check_access('sale.order', order_id, access_token=access_token)
        except (AccessError, MissingError):
            return request.redirect('/my')

        return self._embed_edi_attachments(order_sudo)
