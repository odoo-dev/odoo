# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, modules, tools, _
from odoo.exceptions import UserError

import requests
from urllib.parse import urlparse

import logging
_logger = logging.getLogger(__name__)


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _call_nominatim(self, addr, **kw):
        if not addr:
            _logger.info('nominatim: no address, skipping')
            return None
        if tools.config['test_enable'] or modules.module.current_test:
            raise UserError(_("Nominatim calls disabled in testing environment."))

        headers = {'User-Agent': 'Odoo (http://www.odoo.com/contactus)'}
        url = urlparse(self.env['ir.config_parameter'].sudo().get_param(
            'base_geolocalize.nominatim_server',
            'https://nominatim.openstreetmap.org/'
        ))
        params = {'q': addr, 'format': 'json'}
        if api_key := self.env['ir.config_parameter'].sudo().get_param('base_geolocalize.nominatim_api_key'):
            params['api_key'] = api_key
        try:
            response = requests.get(f"{url.scheme}://{url.netloc}/search", headers=headers, params=params, timeout=5)
            _logger.info('nominatim: %s service called', url.netloc)
            if response.status_code != 200:
                _logger.warning('nominatim: request to %s failed.\nCode: %s\nContent: %s',
                    url.netloc, response.status_code, response.content)
            result = response.json()
        except Exception as e:
            self._raise_query_error(e)
        geo = result[0]
        return float(geo['lat']), float(geo['lon'])

    def _call_nominatim_reverse(self, lat, lon):
        if not (lat and lon):
            _logger.info("nominatim: invalid latitude or longitude given")
            return None
        if tools.config['test_enable'] or modules.module.current_test:
            raise UserError(_("Nominatim calls disabled in testing environment."))

        headers = {"User-Agent": "Odoo (http://www.odoo.com/contactus)"}
        url = urlparse(self.env['ir.config_parameter'].sudo().get_param(
            'base_geolocalize.nominatim_server',
            'https://nominatim.openstreetmap.org/'
        ))
        params = {"lat": lat, "lon": lon, "format": "json"}
        if api_key := self.env['ir.config_parameter'].sudo().get_param('base_geolocalize.nominatim_api_key'):
            params['api_key'] = api_key
        try:
            response = requests.get(f"{url.scheme}://{url.netloc}/reverse", headers=headers, params=params, timeout=5)
            _logger.info('nominatim: %s service called', url.netloc)
            if response.status_code != 200:
                _logger.warning('nominatim: request to %s failed.\nCode: %s\nContent: %s',
                    url.netloc, response.status_code, response.content)
            result = response.json()
        except Exception as e:  # noqa: BLE001
            self._raise_query_error(e)
        return result
