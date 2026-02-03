# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
from datetime import datetime

from odoo import api, fields, models
from odoo.tools import float_repr, format_datetime


class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['account.move', 'zatca.mixin']

    # l10n_sa_qr_code_str = fields.Char(string='Zatka QR Code', compute='_compute_qr_code_str', compute_sudo=True)
    l10n_sa_show_reason = fields.Boolean(compute="_compute_show_l10n_sa_reason")
    l10n_sa_confirmation_datetime = fields.Datetime(string='ZATCA Issue Date',
                                                    readonly=True,
                                                    copy=False,
                                                    help="""Date on which the invoice is generated as final document (after securing all internal approvals).""")

    def _get_qr_code_str_dependencies(self):
        return ['amount_total_signed', 'amount_tax_signed', 'l10n_sa_confirmation_datetime', 'company_id', 'company_id.vat']

    def _get_show_l10n_sa_reason(self):
        self.ensure_one()
        return self.country_code == 'SA' and (self.move_type == 'out_refund' or (self.move_type == 'out_invoice' and self.debit_origin_id))

    def _get_name_invoice_report(self):
        # EXTENDS account
        self.ensure_one()
        if self.company_id.country_code == 'SA':
            return 'l10n_sa.l10n_sa_report_invoice_document'
        return super()._get_name_invoice_report()

    def _l10n_gcc_get_invoice_title(self):
        # EXTENDS l10n_gcc_invoice
        self.ensure_one()
        if self.company_id.country_code != "SA":
            return super()._l10n_gcc_get_invoice_title()

        if self._l10n_sa_is_simplified():
            return self.env._("Simplified Tax Invoice")

        return self.env._("Tax Invoice")

    @api.depends('country_code', 'move_type')
    def _compute_show_delivery_date(self):
        # EXTENDS 'account'
        super()._compute_show_delivery_date()
        for move in self:
            if move.country_code == 'SA':
                move.show_delivery_date = move.is_sale_document()

    def _post(self, soft=True):
        res = super()._post(soft)
        for move in self:
            if move.country_code == 'SA' and move.is_sale_document():
                vals = {}
                if not move.l10n_sa_confirmation_datetime:
                    vals['l10n_sa_confirmation_datetime'] = datetime.combine(move.invoice_date, fields.Datetime.now().time()).strftime(self._get_iso_format_asia_riyadh_date())
                if not move.delivery_date:
                    vals['delivery_date'] = move.invoice_date
                move.write(vals)
        return res

    def get_l10n_sa_confirmation_datetime_sa_tz(self):
        self.ensure_one()
        return format_datetime(self.env, self.l10n_sa_confirmation_datetime, tz='Asia/Riyadh', dt_format='Y-MM-dd\nHH:mm:ss')

    def _l10n_sa_reset_confirmation_datetime(self):
        for move in self.filtered(lambda m: m.country_code == 'SA'):
            move.l10n_sa_confirmation_datetime = False

    def _get_l10n_sa_totals(self):
        self.ensure_one()
        return {
            'total_amount': self.amount_total_signed,
            'total_tax': self.amount_tax_signed,
        }

    def _l10n_sa_is_legal(self):
        # Check if the document is legal in Saudi
        self.ensure_one()
        return self.company_id.country_id.code == 'SA' and self.state == 'posted' and self.l10n_sa_qr_code_str

    def write(self, vals):
        result = super().write(vals)
        invoice_date = vals.get('invoice_date')
        if not invoice_date:
            return result
        for move in self.filtered('l10n_sa_confirmation_datetime'):
            move.l10n_sa_confirmation_datetime = datetime.combine(fields.Date.from_string(invoice_date), move.l10n_sa_confirmation_datetime.time())
        return result
