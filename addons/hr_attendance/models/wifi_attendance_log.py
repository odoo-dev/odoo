# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models

CONNECT_EVENTS = ('bound', 'renewed', 'seen')
DISCONNECT_EVENTS = ('unbound', 'released', 'expired')


class WifiAttendanceLog(models.Model):
    _name = 'wifi.attendance.log'
    _description = 'Wi-Fi Attendance Event Log'
    _order = 'event_time desc, id desc'

    device_id = fields.Many2one('wifi.attendance.device', readonly=True)
    employee_id = fields.Many2one('hr.employee', readonly=True)
    attendance_id = fields.Many2one('hr.attendance', readonly=True)
    event_type = fields.Selection([
        ('bound', 'Bound'),
        ('unbound', 'Unbound'),
        ('renewed', 'Renewed'),
        ('released', 'Released'),
        ('expired', 'Expired'),
        ('seen', 'Seen'),
    ], string="Event", readonly=True)
    event_time = fields.Datetime(readonly=True)
    mac_address = fields.Char(readonly=True)
    ip_address = fields.Char(readonly=True)
    hostname = fields.Char(readonly=True)
    ssid = fields.Char(readonly=True)
    access_point = fields.Char(readonly=True)
    raw_payload = fields.Text(readonly=True)
    state = fields.Selection([
        ('processed', 'Processed'),
        ('ignored', 'Ignored'),
        ('error', 'Error'),
    ], default='ignored', readonly=True)
    error_message = fields.Char(readonly=True)

    def _process_attendance_event(self):
        """Match this log line to a device/employee and update attendance
        state accordingly. Controller calls this right after creating the
        log record — keep business logic here, not in the controller."""
        self.ensure_one()

        device = self.env['wifi.attendance.device'].sudo().search([
            ('mac_address', '=', self.mac_address),
            ('active', '=', True),
        ], limit=1)

        if not device:
            self.state = 'ignored'
            return

        vals = {
            'device_id': device.id,
            'employee_id': device.employee_id.id,
        }

        if self.event_type in CONNECT_EVENTS:
            device.write({
                'last_seen': self.event_time,
                'last_event_type': self.event_type,
                'last_ip_address': self.ip_address,
            })
            if not device.open_attendance_id:
                attendance = self.env['hr.attendance'].sudo().create({
                    'employee_id': device.employee_id.id,
                    'check_in': self.event_time,
                    'in_mode': 'wifi',
                    'in_ip_address': self.ip_address,
                })
                device.open_attendance_id = attendance.id
                vals['attendance_id'] = attendance.id
            else:
                vals['attendance_id'] = device.open_attendance_id.id
            vals['state'] = 'processed'

        elif self.event_type in DISCONNECT_EVENTS:
            # vals['attendance_id'] = device.open_attendance_id.id
            if attendance:
                attendance.write({
                    'check_out': self.event_time,
                    'out_mode': 'wifi',
                    'out_ip_address': self.ip_address,
                })
                device.open_attendance_id = False
                vals['attendance_id'] = attendance.id
            vals['state'] = 'processed'

        else:
            vals['state'] = 'ignored'

        self.write(vals)
