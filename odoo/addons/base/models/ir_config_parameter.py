# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""
Store database-specific configuration parameters
"""

import uuid
import logging

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.tools import config, ormcache, mute_logger, SQL, str2bool

_logger = logging.getLogger(__name__)

"""
A dictionary holding some configuration parameters to be initialized when the database is created.
"""
_default_parameters = {
    "database.secret": lambda: str(uuid.uuid4()),
    "database.uuid": lambda: str(uuid.uuid1()),
    "database.create_date": fields.Datetime.now,
    "web.base.url": lambda: "http://localhost:%s" % config.get('http_port'),
    "base.login_cooldown_after": lambda: 10,
    "base.login_cooldown_duration": lambda: 60,
}


class IrConfigParameter(models.Model):
    """Per-database storage of configuration key-value pairs."""
    _name = 'ir.config_parameter'
    _description = 'System Parameter'
    _rec_name = 'key'
    _order = 'key'
    _allow_sudo_commands = False

    key = fields.Char(required=True)
    value = fields.Text()
    type = fields.Selection([
        ('text', 'Text'),
        ('bool', 'Boolean'),
        ('int', 'Integer'),
        ('float', 'Float'),
    ], string='Parameter Type', default='text')

    _sql_constraints = [
        ('key_uniq', 'unique (key)', 'Key must be unique.')
    ]

    @api.constrains('value', 'type')
    def _check_type(self):
        for param in self:
            if param.value is not False:
                try:
                    self._convert_value(param.value, param.type)
                except (ValueError, TypeError):
                    raise ValidationError(_('value "%(value)s" and its type "%(type)s" are not consistent key "%(key)s"', value=param.value, type=param.type, key=param.key))

    @mute_logger('odoo.addons.base.models.ir_config_parameter')
    def init(self, force=False):
        """
        Initializes the parameters listed in _default_parameters.
        It overrides existing parameters if force is ``True``.
        """
        # avoid prefetching during module installation, as the res_users table
        # may not have all prescribed columns
        self = self.with_context(prefetch_fields=False)
        for key, func in _default_parameters.items():
            # force=True skips search and always performs the 'if' body (because ids=False)
            params = self.sudo().search([('key', '=', key)])
            if force or not params:
                params.set_param(key, func())

    @api.model
    def get(self, key):
        self.check_access_rights('read')
        return self._get(key)

    @ormcache('key')
    def _get(self, key):
        # we bypass the ORM because get_param() is used in some field's depends,
        # and must therefore work even when the ORM is not ready to work
        self.flush_model()
        self.env.cr.execute(SQL('SELECT "value", "type" FROM ir_config_parameter WHERE key = %s', key))
        result = self.env.cr.fetchone()
        if not result:
            raise Exception('parameter not found for key (%s)' % key)
        value, type_ = result
        return self._convert_value(value, type_)

    def _convert_value(self, value, type_):
        if value is None:
            return False
        if type_ == 'bool':
            return str2bool(value)
        if type_ == 'int':
            return int(value)
        if type_ == 'float':
            return float(value)
        return value  # 'text'

    @api.model
    def set(self, key, value):
        if value == self._get(key):
            return
        param = self.search([('key', '=', key)])
        type_ = param.type
        if type_ == 'bool':
            value = str(bool(value))
        elif value is False:
            pass
        elif type_ == 'int':
            value = str(int(value))
        elif type_ == 'float':
            value = str(float(value))
        else:
            value = str(value)
        param.write({'value': value})

    @api.model
    def get_param(self, key, default=False):
        """Retrieve the value for a given key.

        :param string key: The key of the parameter value to retrieve.
        :param string default: default value if parameter is missing.
        :return: The value of the parameter, or ``default`` if it does not exist.
        :rtype: string
        """
        self.check_access_rights('read')
        return self._get_param(key) or default

    @api.model
    @ormcache('key')
    def _get_param(self, key):
        # we bypass the ORM because get_param() is used in some field's depends,
        # and must therefore work even when the ORM is not ready to work
        self.flush_model(['key', 'value'])
        self.env.cr.execute("SELECT value FROM ir_config_parameter WHERE key = %s", [key])
        result = self.env.cr.fetchone()
        return result and result[0]

    @api.model
    def set_param(self, key, value):
        """Sets the value of a parameter.

        :param string key: The key of the parameter value to set.
        :param string value: The value to set.
        :return: the previous value of the parameter or False if it did
                 not exist.
        :rtype: string
        """
        param = self.search([('key', '=', key)])
        if param:
            old = param.value
            if value is not False and value is not None:
                if str(value) != old:
                    param.write({'value': value})
            elif old is not False:
                param.write({'value': False})
            return old
        else:
            if value is not False and value is not None:
                self.create({'key': key, 'value': value})
            return False

    @api.model_create_multi
    def create(self, vals_list):
        self.env.registry.clear_cache()
        return super(IrConfigParameter, self).create(vals_list)

    def _load_records_create(self, vals_list):
        key_to_vals = {vals['key']: vals for vals in vals_list}
        key_to_id = dict.fromkeys(key_to_vals, False)
        existing_params = self.search([('key', 'in', list(key_to_vals))])
        for param in existing_params:
            param.write(key_to_vals.pop(param.key))
            key_to_id[param.key] = param.id
        new_params = self.create(key_to_vals.values())
        for param in new_params:
            key_to_id[param.key] = param.id
        return self.browse(key_to_id.values())

    def write(self, vals):
        if 'key' in vals:
            illegal = _default_parameters.keys() & self.mapped('key')
            if illegal:
                raise ValidationError(_("You cannot rename config parameters with keys %s", ', '.join(illegal)))
        self.env.registry.clear_cache()
        return super(IrConfigParameter, self).write(vals)

    def unlink(self):
        self.env.registry.clear_cache()
        return super(IrConfigParameter, self).unlink()

    @api.ondelete(at_uninstall=False)
    def unlink_default_parameters(self):
        for record in self.filtered(lambda p: p.key in _default_parameters.keys()):
            raise ValidationError(_("You cannot delete the %s record.", record.key))
