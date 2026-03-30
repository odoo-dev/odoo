import re
import uuid

from odoo import api, fields, models, _
from odoo.addons.base.models.res_partner import _tz_get
from odoo.exceptions import ValidationError, UserError


class PosSelfDeviceConfig(models.Model):
    _name = 'pos.self.device.config'
    _description = 'Kiosk Device Configuration'
    _order = 'name asc'

    name = fields.Char(string='Name', required=True)
    version = fields.Char(
        string='Version',
        readonly=True,
        copy=False,
        default=lambda self: str(uuid.uuid4()),
    )
    admin_pin = fields.Char(
        string='Admin PIN',
        required=True,
        help='Numeric PIN to enter admin kiosk mode.',
    )
    timezone = fields.Selection(
        _tz_get,
        string='Timezone',
        default=lambda self: self._default_timezone(),
    )
    language = fields.Many2one(
        'res.lang',
        string='Language',
        default=lambda self: self._default_language(),
        required=False,
    )
    volume = fields.Integer(
        string='Volume',
        default=0,  # 0 % = muted
    )
    brightness = fields.Integer(
        string='Brightness',
        default=100,
    )

    is_default = fields.Boolean(
        string='Default',
        default=False,
        help='Automatically assigned to new devices.',
        copy=False,
    )

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if rec.is_default:
                self._reset_other_defaults(rec.id)
        return records

    def write(self, vals):
        if vals.get('is_default') is False:
            other_default = self.search([
                ('is_default', '=', True),
                ('id', 'not in', self.ids),
            ], limit=1)
            if not other_default:
                raise UserError(
                    _('You cannot unset the default configuration. Please set another config as default first.'))

        vals['version'] = str(uuid.uuid4())
        result = super().write(vals)
        if vals.get('is_default'):
            for rec in self:
                self._reset_other_defaults(rec.id)

        self._notify_devices()
        return result

    def _notify_devices(self):
        devices = self.env['pos.self.device'].search([
            ('device_config_id', 'in', self.ids),
        ])
        if not devices:
            return

        for device in devices:
            device._send_command('refresh_state')

    @api.model
    def _reset_other_defaults(self, exclude_id):
        # Remove is_default from every other config
        self.search([
            ('is_default', '=', True),
            ('id', '!=', exclude_id),
        ]).write({'is_default': False})

    @api.model
    def get_default_config(self):
        # Helper used by the device model and controller
        return self.search([('is_default', '=', True)], limit=1)

    @api.model
    def _default_timezone(self):
        user_tz = self.env.user.tz
        if user_tz:
            return user_tz
        company_tz = self.env.company.partner_id.tz
        if company_tz:
            return company_tz
        return False

    @api.model
    def _default_language(self):
        company = self.env.company
        lang_code = company.partner_id.lang or self.env.lang
        return self.env['res.lang'].search(
            [('code', '=', lang_code)], limit=1
        ).id

    @api.constrains('volume')
    def _check_volume(self):
        for rec in self:
            if not (0 <= rec.volume <= 100):
                raise ValidationError(_('Volume must be between 0 and 100.'))

    @api.constrains('brightness')
    def _check_brightness(self):
        for rec in self:
            if not (0 <= rec.brightness <= 100):
                raise ValidationError(_('Brightness must be between 0 and 100.'))

    @api.constrains('admin_pin')
    def _check_admin_pin(self):
        for rec in self:
            pin = (rec.admin_pin or '').strip()
            if not re.fullmatch(r'\d{4,8}', pin):
                raise ValidationError(
                    _('Admin PIN must be 4 to 8 digits with no spaces or special characters (e.g. 1234, 00892).')
                )

    @api.ondelete(at_uninstall=False)
    def _on_delete_check(self):
        # Block deletion if any record in the batch is the default
        if any(rec.is_default for rec in self):
            raise UserError(_(
                'You cannot delete the default configuration. Please set another config as default first.')
            )
        # Block deletion if the config is still assigned to devices
        devices = self.env['pos.self.device'].search([
            ('device_config_id', 'in', self.ids),
        ])
        if devices:
            device_names = ', '.join(devices.mapped('name'))
            raise UserError(_(
                'This configuration is still assigned to the following device(s): %(device_names)s. Please reassign them before deleting this config.',
                device_names=device_names)
            )

    def _json_dict(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.name,
            'admin_pin': self.admin_pin,
            'timezone': self.timezone,
            'language': self.language.code if self.language else None,
            'volume': self.volume,
            'brightness': self.brightness,
            'version': self.version
        }
