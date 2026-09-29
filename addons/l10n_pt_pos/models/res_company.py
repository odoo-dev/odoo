from odoo import _, fields, models
from odoo.exceptions import UserError


class ResCompany(models.Model):
    _inherit = "res.company"

    def _l10n_pt_pos_check_hash_integrity(self):
        if self.account_fiscal_country_id.code != 'PT':
            raise UserError(_('This feature is only available for Portuguese companies.'))

        results = []
        at_series_records = self.env['l10n_pt.at.series'].with_context(active_test=False).search([
            ('company_id', '=', self.id),
            ('document_type', 'in', ('pos_order', 'pos_refund', 'out_receipt')),
        ])

        for at_series in at_series_records:
            orders = self.env['pos.order'].sudo().search([
                ('l10n_pt_at_series_id', '=', at_series.id),
            ], order='date_order asc, id asc')

            if not orders:
                results.append({
                    'series_at_code': at_series.at_code,
                    'status': 'no_data',
                    'msg_cover': _('No POS orders found for this configuration.'),
                })
                continue

            corrupted_order = None
            prev_date = None
            for order in orders:
                if not order.l10n_pt_inalterable_hash or order.l10n_pt_inalterable_hash.startswith('$1$AAAA'):
                    corrupted_order = order
                    break
                if prev_date and order.date_order < prev_date:
                    corrupted_order = order
                    break
                prev_date = order.date_order

            if corrupted_order:
                results.append({
                    'series_at_code': at_series.at_code,
                    'status': 'corrupted',
                    'msg_cover': f'Corrupted data on POS order with id {corrupted_order.id} ({corrupted_order.l10n_pt_document_number}).',
                })
            else:
                results.append({
                    'series_at_code': at_series.at_code,
                    'status': 'verified',
                    'msg_cover': 'Orders are correctly hashed',
                    'first_date': orders[0].date_order,
                    'last_date': orders[-1].date_order,
                })

        return {'results': results}
