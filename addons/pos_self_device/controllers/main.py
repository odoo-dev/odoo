import base64
import json

from werkzeug.exceptions import NotFound

from odoo import http, fields
from odoo.addons.pos_self_order.controllers.orders import PosSelfOrderController
from odoo.http import request


class PosSelfDeviceController(PosSelfOrderController):

    @http.route('/pos-self-device/register', auth='public', type='http', methods=['POST'], csrf=False)
    def register_device(self):
        body = json.loads(request.httprequest.data)
        access_token = body.get('access_token')

        pos_config = self._verify_pos_config(access_token, check_active_session=False)
        if not pos_config.self_ordering_mode or pos_config.self_ordering_mode == 'nothing':
            raise http.Response(status=400, response="Not a kiosk pos config")

        device = pos_config.env['pos.self.device'].search([('device_id', '=', body.get('device_id'))], limit=1)

        if device.exists():
            device.config_id = pos_config.id
            device.name = body.get('device_name', device.name)
        else:
            device = pos_config.env['pos.self.device'].create({
                'config_id': pos_config.id,
                'device_id': body.get('device_id'),
                'name': body.get('device_name'),
            })

        result = {
            'id': device.id,
            'device_id': device.device_id,
            'name': device.name,
            'access_token': device.access_token,
            'bus_channel': device._get_bus_channel(),
            'auth_cookie': f"{device._cookie_name}={device._format_auth_cookie()}",
            'config': device.device_config_id._json_dict()
        }

        return http.Response(status=200, response=json.dumps(result))

    @http.route('/pos-self-device/unlink', auth='public', type='http', methods=['POST'], csrf=False)
    def unlink_device(self):
        body = json.loads(request.httprequest.data)
        device = self._find_device(body)
        device.unlink()
        return http.Response(status=200, response="Device unlinked")

    @http.route('/pos-self-device/data', auth='public', type='http', methods=['POST'], csrf=False)
    def update_device_data(self):
        body = json.loads(request.httprequest.data)
        device = self._find_device(body)
        state = body.get('state')
        config_version = body.get('config_version')

        if state:
            device.state = state
            device._notify_ui('state_update')

        result = {
            'name': device.name,
        }

        if config_version != device.device_config_id.version:
            result['config'] = device.device_config_id._json_dict()

        return http.Response(status=200, response=json.dumps(result))

    @http.route('/pos-self-device/screenshot', auth='public', type='http',  methods=['POST'], csrf=False)
    def upload_screenshot(self):
        body = json.loads(request.httprequest.data)
        device = self._find_device(body)

        device.write({
            'screenshot': body.get('screenshot'),
            'screenshot_date': fields.Datetime.now(),
        })

        device._notify_ui('screenshot')

        return http.Response(status=200, response={})

    @http.route('/pos-self-device/logs', auth='public', type='http',  methods=['POST'], csrf=False)
    def receive_logs(self, **kwargs):

        access_token = kwargs.get('access_token')
        device_id = kwargs.get('device_id')
        log_file = kwargs.get('logs')
        if not log_file:
            return request.make_response(
                '{"error": "No log file received"}',
                headers=[('Content-Type', 'application/json')],
                status=400
            )

        device = self._find_device({'access_token': access_token, 'device_id': device_id})

        device.write({
            'log': base64.b64encode(log_file.read()).decode('utf-8'),
            'log_date': fields.Datetime.now(),
        })

        device._notify_ui('logs')
        return http.Response(status=200, response={})

    def _find_device(self, body):
        access_token = body.get('access_token')
        device_id = body.get('device_id')
        device = self.env['pos.self.device'].sudo().search([('device_id', '=', device_id)
                                                               , ('access_token', '=', access_token)], limit=1)
        if device.exists():
            return device.with_context(skip_state_bus_notify=True)
        else:
            raise NotFound("Device not found")
