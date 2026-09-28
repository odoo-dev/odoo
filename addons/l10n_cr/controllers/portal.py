# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.http import request, route

from odoo.addons.account.controllers.portal import PortalAccount


class L10nCRPortalAccount(PortalAccount):

    def _prepare_address_form_values(self, partner_sudo, *args, **kwargs):
        rendering_values = super()._prepare_address_form_values(partner_sudo, *args, **kwargs)
        if rendering_values['country'].code == 'CR':
            city = rendering_values['city']
            District = request.env['l10n_cr.res.city.district'].sudo()
            rendering_values['city_districts'] = District.search([('city_id', '=', city.id)]) if city else District
        return rendering_values

    @route(
        "/my/address/l10n_cr_city_info/<model('res.city'):city>",
        type='jsonrpc',
        auth='public',
        methods=['POST'],
        website=True,
    )
    def l10n_cr_city_infos(self, city):
        return {
            'districts': request.env['l10n_cr.res.city.district'].sudo().search_read(
                [('city_id', '=', city.id)], ['id', 'name'],
            ),
        }
