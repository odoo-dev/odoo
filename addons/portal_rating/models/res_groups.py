from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _website__group_website_restricted_editor_optional = models.Ref('website.group_website_restricted_editor', required=False)
