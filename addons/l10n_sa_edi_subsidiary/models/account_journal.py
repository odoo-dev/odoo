from odoo import api, fields, models

class AccountJournal(models.Model):
    _inherit = "account.journal"

    partner_id = fields.Many2one("res.partner", compute="_compute_partner_id", domain="[('is_company', '=', True)]", store=True, readonly=False, required=True, copy=False)

    @api.depends("company_id")
    def _compute_partner_id(self):
        for record in self:
            record.partner_id = record.company_id.partner_id.commercial_partner_id

