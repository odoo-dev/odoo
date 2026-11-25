# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, fields


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_rs_turnover_date = fields.Date(string='Turnover Date')

    @api.depends('country_code')
    def _compute_show_taxable_supply_date(self):
        super()._compute_show_taxable_supply_date()
        for move in self.filtered(lambda m: m.country_code == 'RS' and m.move_type != 'entry'):
            move.show_taxable_supply_date = True

    @api.depends('country_code')
    def _compute_taxable_supply_date_placeholder(self):
        super()._compute_taxable_supply_date_placeholder()
        for move in self.filtered(lambda m: m.country_code == 'RS'):
            move.taxable_supply_date_placeholder = self.env._("Invoice Date")

    def _post(self, soft=True):
        for move in self:
            if move.country_code == 'RS' and move.is_sale_document() and not move.taxable_supply_date:
                move.taxable_supply_date = move.delivery_date or move.invoice_date
        return super()._post(soft)

    def _get_accounting_date_source(self):
        return (self.country_code == 'RS' and self.taxable_supply_date) or super()._get_accounting_date_source()

    def _get_invoice_currency_rate_date(self):
        return (self.country_code == 'RS' and self.taxable_supply_date) or super()._get_invoice_currency_rate_date()

    def _get_default_currency_rate_date(self):
        return (self.country_code == 'RS' and self.taxable_supply_date) or super()._get_default_currency_rate_date()
