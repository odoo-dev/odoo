# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

MAC_RE = re.compile(r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$')


class WifiAttendanceDevice(models.Model):
    _name = 'wifi.attendance.device'
    _description = 'Wi-Fi Attendance Device'
    _rec_name = 'mac_address'

    employee_id = fields.Many2one(
        'hr.employee', string="Employee", required=True,
        ondelete='cascade', index=True)
    mac_address = fields.Char(string="MAC Address", required=True, index=True)
    device_name = fields.Char(string="Device Name")
    hostname = fields.Char(string="Hostname")
    ssid = fields.Char(string="SSID")
    active = fields.Boolean(default=True)
    last_seen = fields.Datetime(string="Last Seen", readonly=True)
    last_event_type = fields.Selection([
        ('bound', 'Bound'),
        ('renewed', 'Renewed'),
        ('released', 'Released'),
        ('expired', 'Expired'),
        ('seen', 'Seen'),
    ], string="Last Event", readonly=True)
    last_ip_address = fields.Char(string="Last IP Address", readonly=True)
    open_attendance_id = fields.Many2one(
        'hr.attendance', string="Open Attendance", readonly=True, copy=False)
    company_id = fields.Many2one(
        'res.company', default=lambda self: self.env.company)

    _sql_constraints = [
        ('mac_address_company_uniq', 'unique(mac_address, company_id)',
         "This MAC address is already registered to a device."),
    ]

    @api.model
    def _normalize_mac(self, mac):
        return (mac or '').strip().upper().replace('-', ':')

    @api.constrains('mac_address')
    def _check_mac_address(self):
        for device in self:
            if not MAC_RE.match(self._normalize_mac(device.mac_address)):
                raise ValidationError(_(
                    "'%s' doesn't look like a valid MAC address "
                    "(expected format AA:BB:CC:DD:EE:FF).", device.mac_address))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('mac_address'):
                vals['mac_address'] = self._normalize_mac(vals['mac_address'])
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('mac_address'):
            vals['mac_address'] = self._normalize_mac(vals['mac_address'])
        return super().write(vals)

    def _cron_checkout_stale_devices(self):
        """Check out anyone whose device hasn't been seen within the grace
        period. Runs every 5 minutes (see data/ir_cron_data.xml)."""
        grace_minutes = int(self.env['ir.config_parameter'].sudo().search(
            [('key', '=', 'hr_attendance_wifi.checkout_grace_minutes')], limit=1
        ).value or 30)
        deadline = fields.Datetime.now() - timedelta(minutes=grace_minutes)

        stale_devices = self.sudo().search([
            ('open_attendance_id', '!=', False),
            ('last_seen', '<', deadline),
        ])
        for device in stale_devices:
            attendance = device.open_attendance_id
            attendance.write({
                'check_out': device.last_seen,
                'out_mode': 'wifi',
                'out_ip_address': device.last_ip_address,
            })
            device.open_attendance_id = False
