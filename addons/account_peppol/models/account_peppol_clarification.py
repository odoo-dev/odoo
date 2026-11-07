from odoo import fields, models


class PeppolClarification(models.Model):
    _name = 'account.peppol.clarification'
    _description = "Peppol clarifications used for rejection"

    _account_peppol__peppol_clarification_reason_unr = models.Ref('account_peppol.peppol_clarification_reason_unr', required=False)

    list_identifier = fields.Selection([
            ('OPStatusReason', 'OPStatusReason'),
            ('OPStatusAction', 'OPStatusAction'),
        ], string='List identifier',
    )
    code = fields.Char()
    name = fields.Char()
    description = fields.Char()
