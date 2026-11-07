from odoo import http


class WebsiteSaleDonation(http.Controller):
    @http.route("/shop/donation/info", type="jsonrpc", auth="public", website=True, replica=True)
    def donation_info(self):
        """Return the donation values needed by the donation snippet.

        :return: A dict with the values required by the donation snippet.
        :rtype: dict
        """
        if not self.env['product.template']._website_sale__product_donation:
            return {}
        # Unpublished, sudo to allow public users to read it
        donation_product_sudo = self.env['product.template']._website_sale__product_donation.sudo()
        if not donation_product_sudo.active:
            return {}
        return {
            "product_template_id": donation_product_sudo.id,
            "product_id": donation_product_sudo.product_variant_id.id,
            **self._get_extra_donation_info(),
        }

    def _get_extra_donation_info(self):
        """Return additional values for the donation snippet.

        :return: A dict with extra values for the donation snippet.
        :rtype: dict
        """
        return {}
