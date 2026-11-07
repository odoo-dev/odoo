from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _api_doc__group_allow_doc = models.Ref('api_doc.group_allow_doc', 'res.groups')
