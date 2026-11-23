# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Domain


class PropertiesBaseDefinition(models.Model):
    _inherit = 'properties.base.definition'

    is_mailing_contact_properties = fields.Boolean(
        "Is Mailing Contact Properties",
        compute='_compute_is_mailing_contact_properties',
        search='_search_is_mailing_contact_properties',
        groups=fields.NO_ACCESS,  # only for record rules
    )

    @api.depends('properties_field_id')
    def _compute_is_mailing_contact_properties(self):
        field = self.env['ir.model.fields']._get('mailing.contact', 'properties')
        for definition in self:
            definition.is_mailing_contact_properties = definition.properties_field_id == field

    def _search_is_mailing_contact_properties(self, operator, value):
        if operator != 'in':
            return NotImplemented
        field = self.env['ir.model.fields']._get('mailing.contact', 'properties')
        return Domain('properties_field_id', '=', field.id)
