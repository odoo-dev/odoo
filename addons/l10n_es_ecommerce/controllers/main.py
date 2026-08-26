# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.http import request, route
from odoo.addons.website_sale.controllers.main import WebsiteSale

L10N_ES_CHECKOUT_IDENTIFIER_KEYS = ('ES_FOREIGN_ID', 'ES_PASSPORT', 'ES_RES_CERT', 'ES_OTHER_ID')


class WebsiteSaleL10nEsEcommerce(WebsiteSale):

    @route()
    def portal_address_country_info(self, country, address_type, **kw):
        # The country-change refresh route doesn't forward the cart, which the
        # simplified-invoice VAT relaxation needs to read the order total.
        # Inject it here so the model stays free of any `request` dependency.
        kw.setdefault('order_sudo', request.cart)
        result = super().portal_address_country_info(country, address_type, **kw)

        if request.env.company.country_code == 'ES':
            state_id = kw.get('state_id')
            state = request.env['res.country.state'].browse(int(state_id)) if state_id else False
            result['l10n_es_id_required'] = request.env['res.partner']._l10n_es_requires_full_invoice_identification(
                country, state
            )

        return result

    def _validate_address_values(
        self, address_values, partner_sudo, address_type, use_delivery_as_billing, *args, **kwargs
    ):
        # EXTENDS portal
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, partner_sudo, address_type, use_delivery_as_billing, *args, **kwargs,
        )

        if (
            request.env.company.country_code != 'ES'
            or (address_type != 'billing' and not use_delivery_as_billing)
        ):
            return invalid_fields, missing_fields, error_messages

        country = request.env['res.country'].browse(address_values.get('country_id'))
        state_id = address_values.get('state_id')
        state = request.env['res.country.state'].browse(state_id) if state_id else False
        if not request.env['res.partner']._l10n_es_requires_full_invoice_identification(country, state):
            return invalid_fields, missing_fields, error_messages

        additional_identifiers = address_values.get('additional_identifiers', {})
        if 'vat' in address_values:
            field_name, value = 'vat', address_values['vat']
        else:
            field_name, value = next(
                (
                    (key.lower(), val) for key, val in additional_identifiers.items()
                    if key in L10N_ES_CHECKOUT_IDENTIFIER_KEYS
                ),
                (None, None),
            )

        if not value:
            if field_name:
                missing_fields.add(field_name)
            error_messages.append(request.env._(
                "An identification document is required for billing addresses outside Spain's VAT "
                "territory (non-EU countries, Canary Islands, Ceuta or Melilla)."
            ))

        return invalid_fields, missing_fields, error_messages
