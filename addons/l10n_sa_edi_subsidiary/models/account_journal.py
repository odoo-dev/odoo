from odoo import api, fields, models
from lxml import etree


class AccountJournal(models.Model):
    _inherit = "account.journal"

    partner_id = fields.Many2one("res.partner", compute="_compute_partner_id", domain="[('is_company', '=', True)]", store=True, readonly=False, required=True, copy=False)

    @api.depends("company_id")
    def _compute_partner_id(self):
        for record in self:
            record.partner_id = record.company_id.partner_id.commercial_partner_id

    def _l10n_sa_get_name_and_vat(self):
        if self.partner_id == self.company_id.partner_id and not self.partner_id.l10n_sa_vat_group_id:
            return super()._l10n_sa_get_name_and_vat()
        return self.partner_id.display_name, self.partner_id.l10n_sa_vat_group_id.vat or self.partner_id.vat

    @api.model
    def _fill_missing_values(self, vals, protected_codes=False):
        super()._fill_missing_values(vals, protected_codes)
        company =  self.env['res.company'].browse(vals['company_id'])
        vals["partner_id"] = company.partner_id.commercial_partner_id.id
