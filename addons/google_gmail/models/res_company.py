from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    uses_google_gmail_server = fields.Boolean('Use a Gmail Server', groups='base.group_system')
    google_gmail_client_identifier = fields.Char('Gmail Client Id', groups='base.group_system')
    google_gmail_client_secret = fields.Char('Gmail Client Secret', groups='base.group_system')
