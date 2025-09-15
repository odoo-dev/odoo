# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api

class LoyaltyCard(models.Model):
    _name = 'loyalty.card'
    _inherit = ['loyalty.card', 'pos.load.mixin']

    source_pos_order_id = fields.Many2one('pos.order', "PoS Order Reference",
        help="PoS order where this coupon was generated.")

    @api.model
    def _load_pos_data_domain(self, data):
        # promotion, promo_code and buy_x_get_y_free are never created in advance.
        # They are created at order sync an assigned to the order that created them.
        # So we don't need to load them in the POS.
        coupon_gift_program_ids = []
        loyalty_wallet_program_ids = []
        for program in data['loyalty.program']['data']:
            if program['program_type'] in ['coupons', 'gift_card', 'next_order_coupons']:
                coupon_gift_program_ids.append(program['id'])
            elif program['program_type'] in ['loyalty', 'ewallet']:
                loyalty_wallet_program_ids.append(program['id'])
        return [
            '|',
            '&',
            ('program_id', 'in', coupon_gift_program_ids),
            ('points', '>', 0),  # coupons and gift cards are one off, so no need to load the empty ones.
            ('program_id', 'in', loyalty_wallet_program_ids),
            '|',
            ('expiration_date', '>=', fields.Date.today()),
            ('expiration_date', '=', False),
        ]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['partner_id', 'code', 'points', 'program_id', 'expiration_date', 'write_date']

    def _has_source_order(self):
        return super()._has_source_order() or bool(self.source_pos_order_id)

    def _get_default_template(self):
        self.ensure_one()
        if self.source_pos_order_id:
            return self.env.ref('pos_loyalty.mail_coupon_template', False)
        return super()._get_default_template()

    def _get_mail_partner(self):
        return super()._get_mail_partner() or self.sudo().source_pos_order_id.partner_id

    def _get_signature(self):
        return self.source_pos_order_id.user_id.signature or super()._get_signature()

    def _compute_use_count(self):
        super()._compute_use_count()
        read_group_res = self.env['pos.order.line']._read_group(
            [('coupon_id', 'in', self.ids)], ['coupon_id'], ['__count'])
        count_per_coupon = {coupon.id: count for coupon, count in read_group_res}
        for card in self:
            card.use_count += count_per_coupon.get(card.id, 0)
