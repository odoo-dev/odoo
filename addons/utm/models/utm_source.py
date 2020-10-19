# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import uuid

from odoo import fields, models, api, tools, _


class UtmSource(models.Model):
    _name = 'utm.source'
    _description = 'UTM Source'

    name = fields.Char(string='Source Name', required=True, translate=True)
    identifier = fields.Char(
        string='Identifier', readonly=True, index=True, copy=False)

    _sql_constraints = [
        ('unique_identifier', 'UNIQUE(identifier)', 'The identifier must be unique')
    ]

    @api.model
    def create(self, vals):
        if vals.get('name') and not vals.get('identifier'):
            vals['identifier'] = self.env['utm.mixin']._generate_identifier_from_name(self, vals.get('name'))

        elif vals.get('identifier') and not vals.get('name'):
            # Use the identifier to fill the name field
            # e.g.: when an unknown UTM medium is found in the cookies
            vals['name'] = vals.get('identifier')

        return super(UtmSource, self).create(vals)

    def _generate_name(self, record, content):
        """Generate the UTM source name based on the content of the source."""
        if len(content) > 25:
            content = f'{content[:25]}...'

        create_date = record.create_date or fields.date.today()
        create_date = fields.date.strftime(create_date, tools.DEFAULT_SERVER_DATE_FORMAT)
        model_description = self.env['ir.model']._get(record._name).name
        return _('%s (%s created on %s)', content, model_description, create_date)

    def _generate_identifier(self, record):
        """Generate the UTM source identifier based on the record."""
        return f'{record._table}_{str(uuid.uuid4())[:8]}'
