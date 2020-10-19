# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


from odoo import fields, models, api, SUPERUSER_ID


class UtmCampaign(models.Model):
    _name = 'utm.campaign'
    _description = 'UTM Campaign'

    name = fields.Char(string='Campaign Name', required=True, translate=True)
    identifier = fields.Char(
        string='Identifier', readonly=True, index=True, copy=False)
    user_id = fields.Many2one(
        'res.users', string='Responsible',
        required=True, default=lambda self: self.env.uid)
    stage_id = fields.Many2one(
        'utm.stage', string='Stage', ondelete='restrict', required=True,
        default=lambda self: self.env['utm.stage'].search([], limit=1),
        group_expand='_group_expand_stage_ids')
    tag_ids = fields.Many2many(
        'utm.tag', 'utm_tag_rel',
        'tag_id', 'campaign_id', string='Tags')

    is_website = fields.Boolean(default=False, help="Allows us to filter relevant Campaign")
    color = fields.Integer(string='Color Index')

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

        return super(UtmCampaign, self).create(vals)

    @api.model
    def _group_expand_stage_ids(self, stages, domain, order):
        """Read group customization in order to display all the stages in the
        Kanban view, even if they are empty.
        """
        stage_ids = stages._search([], order=order, access_rights_uid=SUPERUSER_ID)
        return stages.browse(stage_ids)
