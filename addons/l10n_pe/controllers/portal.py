# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.http import request, route


class L10nPECustomerPortal(CustomerPortal):

    def _is_peru_company(self):
        return request.env.company.country_code == 'PE'

    def _get_mandatory_billing_address_fields(self, country_sudo):
        mandatory_fields = super()._get_mandatory_billing_address_fields(country_sudo)
        if not self._is_peru_company():
            return mandatory_fields

        # For Peruvian company, the VAT is required for all the partners
        mandatory_fields.add('vat')
        if country_sudo.code == 'PE':
            mandatory_fields |= {
                'state_id', 'city_id', 'l10n_pe_district',
            }
            mandatory_fields.remove('city')
        return mandatory_fields

    def _get_mandatory_delivery_address_fields(self, country_sudo):
        mandatory_fields = super()._get_mandatory_delivery_address_fields(country_sudo)
        if not self._is_peru_company():
            return mandatory_fields

        if country_sudo.code == 'PE':
            mandatory_fields |= {'state_id', 'city_id', 'l10n_pe_district'}
            mandatory_fields.remove('city')
        return mandatory_fields

    def _prepare_address_form_values(self, partner_sudo, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, **kwargs
        )
        if not self._is_peru_company():
            return rendering_values

        state = request.env['res.country.state'].browse(rendering_values['state_id'])
        city = partner_sudo.city_id
        ResCity = request.env['res.city'].sudo()
        District = request.env['l10n_pe.res.city.district'].sudo()
        rendering_values.update({
            'state': state,
            'state_cities': ResCity.search([('state_id', '=', state.id)]) if state else ResCity,
            'city': city,
            'city_districts': District.search([('city_id', '=', city.id)]) if city else District,
        })
        return rendering_values

    @route(
        '/portal/state_infos/<model("res.country.state"):state>',
        type='jsonrpc',
        auth='public',
        methods=['POST'],
        website=True,
    )
    def state_infos(self, state, **kw):
        states = request.env['res.city'].sudo().search([('state_id', '=', state.id)])
        return {'cities': [(c.id, c.name, c.l10n_pe_code) for c in states]}

    @route(
        '/portal/city_infos/<model("res.city"):city>',
        type='jsonrpc',
        auth='public',
        methods=['POST'],
        website=True,
    )
    def city_infos(self, city, **kw):
        districts = request.env['l10n_pe.res.city.district'].sudo().search([('city_id', '=', city.id)])
        return {'districts': [(d.id, d.name, d.code) for d in districts]}
