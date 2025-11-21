# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route

from odoo.addons.l10n_latam_base.controllers.portal import L10nLatamBasePortalAccount


class L10nPEPortalAccount(L10nLatamBasePortalAccount):

    def _is_peru_company(self):
        return request.env.company.country_code == 'PE'

    def _prepare_address_form_values(self, partner_sudo, *args, **kwargs):
        rendering_values = super()._prepare_address_form_values(partner_sudo, *args, **kwargs)
        if not self._is_peru_company():
            return rendering_values

        District = request.env['l10n_pe.res.city.district'].sudo()
        districts = District
        if city := rendering_values['city']:
            districts = District.search([('city_id', '=', city.id)])
        rendering_values['city_districts'] = districts

        return rendering_values

    def _get_mandatory_address_fields(self, country_sudo):
        mandatory_fields = super()._get_mandatory_address_fields(country_sudo)

        if self._is_peru_company() and country_sudo.code == 'PE':
            mandatory_fields.add('l10n_pe_district')

        return mandatory_fields

    def _l10n_get_default_identification_type_id(self):
        return (
            (self.env.company.country_code == 'PE' and request.env.ref('l10n_pe.it_DNI'))
            or super()._l10n_get_default_identification_type_id()
        )

    def _get_address_format_fields_mapping(self):
        res = super()._get_address_format_fields_mapping()
        res['l10n_pe_district_name'] = 'l10n_pe_district'
        return res

    @route()
    def portal_address_country_info(self, country, address_type, **kw):
        res = super().portal_address_country_info(country, address_type, **kw)

        if self._is_peru_company() and country.code == 'PE':
            # Show the field once Peru is selected, but without any value as a city needs to be
            # selected first.
            res['selection']['l10n_pe_district'] = []

        return res

    @route(
        '/my/address/city_info/<model("res.city"):city>',
        type='jsonrpc',
        auth='public',
        methods=['POST'],
        website=True,
        readonly=True,
    )
    def city_info(self, city, **kw):
        """Provide district choices on city change."""
        res = {}

        if self._is_peru_company() and city.country_id.code == 'PE':
            res['districts'] = request.env['l10n_pe.res.city.district'].sudo().search_read(
                [('city_id', '=', city.id)],
                ['id', 'name', 'code'],
            )

        return res
