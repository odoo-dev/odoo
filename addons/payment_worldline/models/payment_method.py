from odoo import models


class PaymentMethod(models.Model):
    _inherit = "payment.method"

    def _get_worldline_incompatible_card_brands(self, partner_id=None, currency_id=None):
        """ Get all incompatible cards brands for a specific country and/or currency.

        Depending on the configuration, some card brand may be restricted to
        a specific list of countries and/or currencies, this return the brands
        that are NOT compatible for the requested partner and/or currency.

        :param int partner_id: country for the current transaction
        :param int currency_id: currency for the current transaction
        :return: The incompatible payment method brands
        :rtype: payment.method
        """
        self.ensure_one()
        currency = self.env["res.currency"].browse(currency_id)
        country = partner_id and self.env["res.partner"].browse(partner_id).country_id or self.env["res.country"]
        return self.brand_ids.filtered(lambda brand: (
            (brand.supported_currency_ids and currency - brand.supported_currency_ids)
            or
            (brand.supported_country_ids and country - brand.supported_countries_ids)
        ))
