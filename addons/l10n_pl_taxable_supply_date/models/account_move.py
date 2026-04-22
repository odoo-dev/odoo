from odoo import models, fields, api


class AccountMove(models.Model):
    _inherit = 'account.move'

    taxable_supply_date = fields.Date()

    def _get_accounting_date_source(self):
        self.ensure_one()
        if self.country_code == 'PL' and self.taxable_supply_date:
            return self.taxable_supply_date
        return super()._get_accounting_date_source()

    @api.depends('taxable_supply_date')
    def _compute_date(self):
        super()._compute_date()

    @api.depends('taxable_supply_date')
    def _compute_invoice_currency_rate(self):
        # In Poland, the currency rate should be based on the taxable supply date.
        super()._compute_invoice_currency_rate()

    @api.depends('taxable_supply_date')
    def _compute_currency_rate_date(self):
        use_taxable_supply_date = self.filtered(lambda m: m.country_code == 'PL' and m.taxable_supply_date)
        for move in use_taxable_supply_date:
            move.currency_rate_date = move.taxable_supply_date

        super(AccountMove, self - use_taxable_supply_date)._compute_currency_rate_date()
