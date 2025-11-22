from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    uses_microsoft_outlook_server = fields.Boolean('Use an Outlook Server', groups='base.group_system')
    microsoft_outlook_client_identifier = fields.Char('Outlook Client Id', groups='base.group_system')
    microsoft_outlook_client_secret = fields.Char('Outlook Client Secret', groups='base.group_system')
