# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class LoyaltyCard(models.Model):
    _inherit = 'loyalty.card'

    source_pos_order_id = fields.Many2one('pos.order', "PoS Order Reference",
        help="PoS order where this coupon was generated.")

    def _has_source_order(self):
        return super()._has_source_order() or bool(self.source_pos_order_id)

    def _get_default_template(self):
        self.ensure_one()
        if self.source_pos_order_id:
            return self.env.ref('pos_loyalty.mail_coupon_template', False)
        return super()._get_default_template()

    def _get_mail_partner(self):
        return super()._get_mail_partner() or self.source_pos_order_id.partner_id

    def _get_signature(self):
        return self.source_pos_order_id.user_id.signature or super()._get_signature()

    def _compute_use_count(self):
        super()._compute_use_count()
        aggregate_res = self.env['pos.order.line']._aggregate(
            [('coupon_id', 'in', self.ids)], ['*:count'], ['coupon_id'])
        for card in self:
            card.use_count += aggregate_res.get_agg(card, '*:count', 0)
