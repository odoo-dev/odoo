import uuid

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.tools import consteq
from odoo.tools import human_size


class PosSelfDevice(models.Model):
    _name = 'pos.self.device'
    _description = "Point of Sale Self Device"
    _order = 'name asc'
    _cookie_separator = '|'
    _cookie_name = 'psdid'

    name = fields.Char(string='Name', required=True)
    config_id = fields.Many2one('pos.config', string='PoS Configuration', index=True, required=True)
    access_token = fields.Char(string="Access Token", default=lambda self: str(uuid.uuid4()),
                               groups='base.group_system', required=True, readonly=True, copy=False)
    device_id = fields.Char(string='Device Identifier', required=True, index=True)
    status = fields.Selection(
        [("online", "Online"), ("offline", "Offline")],
        "Status",
        default="offline",
    )

    device_config_id = fields.Many2one('pos.self.device.config', string='Configuration', index=True, required=True)
    device_config_updated_at = fields.Datetime(
        string='Config applied at',
        readonly=True,
        copy=False,
    )

    config_in_sync = fields.Boolean(
        string='Config in sync',
        compute='_compute_config_in_sync',
        store=False,
    )

    status_updated_at = fields.Datetime(string="Status updated at")
    state = fields.Json(
        string='State',
        default=dict,
    )
    state_updated_at = fields.Datetime(string="Last state update")

    screenshot = fields.Binary(string='Screenshot')
    screenshot_date = fields.Datetime(string='Screenshot Date')

    log = fields.Binary(string='File', attachment=True)
    log_date = fields.Datetime(string='Log Date')

    # Device Info
    device_model = fields.Char(string='Model', compute='_compute_state_fields')
    device_name = fields.Char(string='Device Name', compute='_compute_state_fields')
    android_version = fields.Char(string='Android Version', compute='_compute_state_fields')
    android_build = fields.Char(string='Android Build', compute='_compute_state_fields')
    android_id = fields.Char(string='Android ID', compute='_compute_state_fields')
    app_version = fields.Char(string='App Version', compute='_compute_state_fields')
    web_view = fields.Char(string='WebView', compute='_compute_state_fields')
    language = fields.Char(string='Language', compute='_compute_state_fields')
    timezone = fields.Char(string='Timezone', compute='_compute_state_fields')
    device_owner = fields.Boolean(string='Device Owner', compute='_compute_state_fields')
    uptime = fields.Float(string='Uptime', compute='_compute_state_fields')

    # Screen
    screen_size = fields.Char(string='Screen Size', compute='_compute_state_fields')
    screen_brightness = fields.Integer(string='Screen Brightness', compute='_compute_state_fields')
    screen_on = fields.Boolean(string='Screen On', compute='_compute_state_fields')
    screen_locked = fields.Boolean(string='Screen Locked', compute='_compute_state_fields')

    # Battery & Power
    battery_level = fields.Integer(string='Battery Level', compute='_compute_state_fields')
    plugged_in = fields.Boolean(string='Plugged In', compute='_compute_state_fields')

    # RAM & Storage
    ram = fields.Char(string='RAM', compute='_compute_state_fields')
    storage = fields.Char(string='Storage', compute='_compute_state_fields')

    # Network
    wifi = fields.Char(string='WiFi', compute='_compute_state_fields')
    ip_address = fields.Char(string='IP Address', compute='_compute_state_fields')
    ethernet = fields.Boolean(string='Ethernet', compute='_compute_state_fields')
    airplane_mode = fields.Boolean(string='Airplane Mode', compute='_compute_state_fields')

    @api.model_create_multi
    def create(self, vals_list):
        default_config = self.env['pos.self.device.config'].get_default_config()
        for vals in vals_list:
            if not vals.get('device_config_id') and default_config:
                vals['device_config_id'] = default_config.id
        return super().create(vals_list)

    @api.depends('state')
    def _compute_state_fields(self):
        for record in self:
            data = record.state or {}

            # Device Info
            record.device_model = data.get('model', '')
            record.device_name = data.get('deviceName', '')
            record.android_version = data.get('androidVersion', '')
            record.android_build = data.get('androidBuild', '')
            record.android_id = data.get('androidId', '')
            record.web_view = data.get('webView', '')
            record.app_version = data.get('appVersion', '')
            record.language = data.get('language', '')
            record.timezone = data.get('timezone', '')
            record.device_owner = data.get('isDeviceOwner', False)

            # Screen
            record.screen_size = data.get('screenSize', '')
            record.screen_brightness = data.get('screenBrightness', 0)
            record.screen_on = data.get('isScreenOn', False)
            record.screen_locked = data.get('isScreenOLocked', False)

            # Battery & Power
            record.battery_level = data.get('batteryLevel', 0)
            record.plugged_in = data.get('isPluggedIn', False)

            ram_used = data.get('ramUsed', 0) or 0
            ram_total = data.get('ramTotal', 0) or 0
            ram_free = ram_total - ram_used

            record.ram = _("%(used)s / %(total)s (%(free)s free)", used=human_size(ram_used) or '0',
                           total=human_size(ram_total), free=human_size(ram_free))

            storage_used = data.get('storageUsed', 0) or 0
            storage_total = data.get('storageTotal', 0) or 0
            storage_free = storage_total - storage_used

            record.storage = _("%(used)s / %(total)s (%(free)s free)", used=human_size(storage_used) or '0',
                               total=human_size(storage_total), free=human_size(storage_free))

            # Network
            record.ip_address = data.get('ipAddress', '')
            record.wifi = _("No")
            if data.get('isWifiConnected', False):
                record.wifi = f"{data.get('wifiName', '?')} {_("Signal: %s/4", data.get('wifiSignal', 0))} "
            record.ethernet = data.get('isEthernetConnected', False)
            record.airplane_mode = data.get('isAirplaneModeOn', False)

            # Misc
            record.uptime = data.get('uptimeMillis', 0)

    @api.depends('state')
    def _compute_config_in_sync(self):
        for rec in self:
            rec.config_in_sync = (
                    rec.config_id
                    and rec.device_config_id == rec.device_config_id.version
            )

    def write(self, vals):

        old_names = {record.id: record.name for record in self}

        if 'state' in vals:
            vals['state_updated_at'] = fields.Datetime.now()

        if 'status' in vals:
            # Only update the last_status_change if the status is actually changing, not just being set to the same value
            changing = self.filtered(lambda r: r.status != vals['status'])
            res = super().write(vals)
            if changing:
                changing.write({'status_updated_at': fields.Datetime.now()})
            return res

        res = super().write(vals)

        if 'name' in vals and not self.env.context.get('skip_state_bus_notify'):
            for record in self:
                old_name = old_names.get(record.id)
                new_name = record.name

                if old_name != new_name:
                    record._send_command('refresh_state')

        return res

    @api.constrains('config_id', 'device_id')
    def _check_unique_serial_site(self):
        for rec in self:
            domain = [
                ('device_id', '=', rec.device_id),
                ('config_id', '=', rec.config_id.id),
                ('id', '!=', rec.id),
            ]
            if rec.search_count(domain):
                raise ValidationError(
                    _("The device '%s' is already registered for this config", rec.name)
                )

    def _get_bus_channel(self):
        self.ensure_one()
        return f"pos_self_device_{self.access_token}"

    def _format_auth_cookie(self):
        self.ensure_one()
        return f"{self.id}{self._cookie_separator}{self.access_token}"

    def _get_device_from_token(self, token=""):
        if not token:
            return None
        device = self.env["pos.self.device"]
        token_parts = token.split(self._cookie_separator)
        if len(token_parts) == 2:
            device_id, device_access_token = token_parts
            # sudo: need sudo to read their access_token
            device = self.browse(int(device_id)).sudo().exists()
            if not device or not device.access_token or not consteq(device.access_token, device_access_token):
                device = self.env["pos.self.device"]
        return device.sudo(False)

    def action_refresh_state(self):
        self.ensure_one()
        self._send_command('refresh_state')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_take_screenshot(self):
        self.ensure_one()
        self._send_command('take_screenshot')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_get_logs(self):
        self.ensure_one()
        self._send_command('get_logs')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_reload_url(self):
        self.ensure_one()
        self._send_command('reload_url')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_lock_screen(self):
        self.ensure_one()
        self._send_command('lock_screen')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_unlock_screen(self):
        self.ensure_one()
        self._send_command('unlock_screen')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Action sent to the device',
                'type': 'info',
                'sticky': False,
            }
        }

    def _send_command(self, cmd_type, payload=None):
        self.ensure_one()
        self.env['bus.bus']._sendone(self._get_bus_channel(), 'kiosk_cmd',
                                     {'action': cmd_type, 'payload': payload or {}})

    def _notify_ui(self, notif_type):
        self.ensure_one()
        self.env['bus.bus']._sendone(f"pos_self_device_{self.id}", 'pos_self_device_ui_update', {'type': notif_type})
