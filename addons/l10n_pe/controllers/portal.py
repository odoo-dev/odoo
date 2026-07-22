# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route

from odoo.addons.l10n_latam_base.controllers.portal import L10nLatamBasePortalAccount


class L10nPEPortalAccount(L10nLatamBasePortalAccount):

    def _prepare_address_form_values(self, partner_sudo, *args, **kwargs):
        rendering_values = super()._prepare_address_form_values(partner_sudo, *args, **kwargs)
        if rendering_values["country"].code == "PE":
            city = rendering_values["city"]
            District = request.env['l10n_pe.res.city.district'].sudo()
            if city:
                rendering_values["city_districts"] = District.search([("city_id", "=", city.id)])
            else:
                rendering_values["city_districts"] = District
        return rendering_values

    def _l10n_get_default_identification_type_id(self):
        return (
            (self.env.company.country_code == 'PE' and request.env.ref('l10n_pe.it_DNI'))
            or super()._l10n_get_default_identification_type_id()
        )

    @route(
        "/my/address/city_info/<model('res.city'):city>",
        type='jsonrpc',
        auth='public',
        methods=['POST'],
        website=True,
    )
    def city_infos(self, city, **kw):
        return {
            'districts': request.env['l10n_pe.res.city.district'].sudo().search_read(
                [('city_id', '=', city.id)], ['id', 'name', 'code']
            )
        }
