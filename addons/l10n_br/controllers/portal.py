# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _lt
from odoo.http import request

from odoo.addons.l10n_latam_base.controllers.portal import L10nLatamBaseCustomerPortal

class L10nBRCustomerPortal(L10nLatamBaseCustomerPortal):

    def _is_brazilean_fiscal_country(self):
        return request.env.company.account_fiscal_country_id.code == 'BR'

    def _prepare_address_form_values(self, partner_sudo, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, **kwargs
        )
        if self._is_brazilean_fiscal_country() and rendering_values['use_delivery_as_billing']:
            rendering_values.update({
                'city_sudo': partner_sudo.city_id,
                'cities_sudo': request.env['res.city'].sudo().search([('country_id.code', '=', 'BR')]),
                'vat_label': _lt('Number'),
            })
        return rendering_values

    def _get_mandatory_address_fields(self, country_sudo):
        # EXTEND 'portal'
        mandatory_fields = super()._get_mandatory_address_fields(country_sudo)
        if (country_sudo.code == 'BR' and self._is_brazilean_fiscal_country()):
            mandatory_fields |= {
                'vat', 'l10n_latam_identification_type_id', 'street_name', 'street2', 'street_number', 'city_id'
            }
            mandatory_fields -= {'street', 'city'}  # Brazil uses the base_extended_address fields added above

        return mandatory_fields
