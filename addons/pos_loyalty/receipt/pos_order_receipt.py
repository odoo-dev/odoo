# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _
from odoo.tools.image import image_data_uri
from odoo.tools import float_round


class PosOrderReceipt(models.AbstractModel):
    _inherit = 'pos.order.receipt'
    _description = 'Point of Sale Order Receipt Generator'

    def order_receipt_generate_data(self, basic_receipt=False):
        data = super().order_receipt_generate_data(basic_receipt)
        loyalties, new_coupons = [], []
        histories = self.env['loyalty.history'].search([('order_id', '=', self.id), ('order_model', '=', 'pos.order')])
        # Aggregate per card: one order can produce separate issuing/consuming rows
        # for the same card, so raw rows can't be used directly.
        cards_in_order = histories.card_id.browse(dict.fromkeys(histories.card_id.ids))
        for card in cards_in_order:
            program_type = card.program_id.program_type
            card_histories = histories.filtered(lambda h: h.card_id == card)
            if program_type == 'loyalty':
                for amount, label in [
                    (sum(card_histories.mapped('issued')), _('Won:')),
                    (sum(card_histories.mapped('used')), _('Spent:')),
                ]:
                    if amount > 0:
                        loyalties.append({
                            'name': card.program_id.portal_point_name,
                            'type': label,
                            'points': float_round(amount, 2),
                        })

                loyalties.append({
                    'name': card.program_id.portal_point_name,
                    'type': _('Balance:'),
                    'points': float_round(card.points, 2),
                })

            elif program_type == 'next_order_coupons':
                new_coupons.append({
                    'name': card.program_id.name,
                    'code': card.code,
                    'expiration_date': card.expiration_date,
                    'barcode_base64': image_data_uri(self.env['ir.actions.report'].barcode('Code128', card.code, quiet=False)),
                })

        data['extra_data']['loyalties'] = loyalties
        data['extra_data']['new_coupons'] = new_coupons

        return data
