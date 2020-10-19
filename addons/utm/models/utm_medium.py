# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


from odoo import fields, models, api


class UtmMedium(models.Model):
    _name = 'utm.medium'
    _description = 'UTM Medium'
    _order = 'name'

    name = fields.Char(string='Medium Name', required=True, translate=True)
    identifier = fields.Char(
        string='Identifier', readonly=True, index=True, copy=False)
    active = fields.Boolean(default=True)

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

        return super(UtmMedium, self).create(vals)
