# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
from markupsafe import Markup
from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_repr


class PosOrder(models.Model):
    _name = "pos.order"
    _inherit = ["pos.order", "l10n.pt.hashed.document.mixin"]

    _l10n_pt_date_field = "date_order"

    country_code = fields.Char(related='company_id.account_fiscal_country_id.code')
    l10n_pt_is_reprint = fields.Boolean(readonly=True)

    # Alias for backward-compatibility with JS and POS overrides
    l10n_pt_pos_inalterable_hash = fields.Char(
        string="Inalterability Hash.",
        related="l10n_pt_inalterable_hash",
        readonly=True,
    )

    def _l10n_pt_get_document_date(self):
        self.ensure_one()
        return self.date_order.date() if self.date_order else fields.Date.context_today(self)

    def _l10n_pt_get_document_type(self):
        self.ensure_one()
        return 'pos_refund' if self.amount_total < 0 else 'pos_order'

    def _l10n_pt_get_document_number(self):
        return self.l10n_pt_document_number

    def _l10n_pt_get_gross_total(self):
        self.ensure_one()
        # Refunds must return a positive gross total
        return abs(self.amount_total)

    def _l10n_pt_get_saft_doc_type(self):
        self.ensure_one()
        return 'NC' if self.amount_total < 0 else 'FS'

    def _l10n_pt_series_document_types(self):
        return ('pos_order', 'pos_refund')

    def _l10n_pt_get_unhashed_records(self, at_series):
        return self.search([
            ('l10n_pt_at_series_id', '=', at_series.id),
            ('l10n_pt_inalterable_hash', '=', False),
            ('state', 'in', ('paid', 'done', 'invoiced')),
        ], order='date_order, id')

    def _l10n_pt_find_last_hashed(self, at_series):
        return self.search([
            ('l10n_pt_at_series_id', '=', at_series.id),
            ('l10n_pt_inalterable_hash', '!=', False),
            ('state', 'in', ('paid', 'done', 'invoiced')),
        ], order='date_order desc, id desc', limit=1)

    def _l10n_pt_get_sequence_number(self):
        self.ensure_one()
        if self.l10n_pt_document_number:
            match = re.search(r'/([0-9]+)$', self.l10n_pt_document_number)
            if match:
                return int(match.group(1))
        return self.id

    def _l10n_pt_qr_get_totals(self):
        self.ensure_one()
        return float_repr(abs(self.amount_tax), 2), float_repr(abs(self.amount_total), 2)

    def _get_integrity_hash_fields(self):
        if not self._l10n_pt_country_ok():
            return []
        return super()._get_integrity_hash_fields() + ['date_order']

    def _process_saved_order(self, draft):
        res = super()._process_saved_order(draft)
        for order in self:
            if order.country_code == 'PT' and not draft and order.state in ('paid', 'done', 'invoiced'):
                if not order.l10n_pt_at_series_id and order.config_id.l10n_pt_pos_at_series_id:
                    order.l10n_pt_at_series_id = order.config_id.l10n_pt_pos_at_series_id
                if not order.l10n_pt_document_number and order.l10n_pt_at_series_id:
                    order._set_l10n_pt_document_number()
                if not order.l10n_pt_inalterable_hash and order.l10n_pt_at_series_id:
                    order._l10n_pt_compute_missing_hashes(order.company_id)
        return res

    def _l10n_pt_pos_compute_missing_hashes(self, config_id=None):
        config = self.env['pos.config'].browse(config_id) if config_id else self.config_id
        if not config or config.country_code != 'PT':
            return
        series = config.l10n_pt_pos_at_series_id
        if not series:
            return
        orders = self.search([
            ('config_id', '=', config.id),
            ('country_code', '=', 'PT'),
            ('state', 'in', ('paid', 'done', 'invoiced')),
            ('l10n_pt_inalterable_hash', '=', False),
        ], order='date_order, id')
        for order in orders:
            if not order.l10n_pt_at_series_id:
                order.l10n_pt_at_series_id = series
            if not order.l10n_pt_document_number:
                order._set_l10n_pt_document_number()
        if orders:
            orders._l10n_pt_compute_missing_hashes(config.company_id)

    def l10n_pt_pos_compute_missing_hashes(self, config_id=None):
        return self._l10n_pt_pos_compute_missing_hashes(config_id)

    def _generate_pos_order_invoice(self):
        if self.country_code != 'PT':
            return super()._generate_pos_order_invoice()

        result = super(PosOrder, self.filtered('partner_id').with_context(generate_pdf=False))._generate_pos_order_invoice()

        for order in self.filtered(lambda o: not o.partner_id and not o.account_move):
            move = order._create_invoice({
                'move_type': 'out_receipt',
                'journal_id': order.session_id.config_id.invoice_journal_id.id,
                'invoice_origin': order.name,
                'ref': order.name,
                'currency_id': order.currency_id.id,
                'invoice_date': order.date_order.date(),
                'pos_order_ids': order.ids,
                'invoice_line_ids': order._prepare_invoice_lines(),
            })
            order.state = 'invoiced'
            move.sudo().with_company(order.company_id)._post()

        self.env['account.move']._l10n_pt_compute_missing_hashes()
        return result

    def _l10n_pt_pos_get_vat_exemptions_reasons(self):
        self.ensure_one()
        taxes_with_exemption = self.lines.tax_ids.filtered(lambda tax: tax.l10n_pt_tax_exemption_reason)
        return sorted(set(taxes_with_exemption.mapped(
            lambda tax: dict(tax._fields['l10n_pt_tax_exemption_reason'].selection).get(tax.l10n_pt_tax_exemption_reason)
        )))

    def update_l10n_pt_print_version(self):
        self.ensure_one()
        self.l10n_pt_is_reprint = True

    def post_reprint_reason(self, reason):
        self.ensure_one()
        msg = Markup(_("Reason for reprinting document %(name)s:<br/>%(reason)s")) % {
            'name': self.name,
            'reason': reason,
        }
        self.message_post(body=msg)
        return True

    def l10n_pt_get_order_vals(self):
        self.ensure_one()
        doc = self.account_move or self
        if not doc or not doc.l10n_pt_inalterable_hash:
            return {}
        doc_type_selection = dict(doc._fields['l10n_pt_document_type']._description_selection(self.env))
        return {
            'name': self.name,
            'hash_short': doc.l10n_pt_inalterable_hash_short,
            'atcud': doc.l10n_pt_atcud,
            'document_identifier': doc.l10n_pt_document_number,
            'qr_code_str': doc.l10n_pt_qr_code_str,
            'is_reprint': self.l10n_pt_is_reprint,
            'document_type': doc_type_selection.get(doc.l10n_pt_document_type, ''),
            'training_mode': doc.l10n_pt_at_series_id.training_series if doc.l10n_pt_at_series_id else False,
        }
