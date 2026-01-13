# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Changed from Many2one to Many2many
    self_order_online_payment_method_ids = fields.Many2many('pos.payment.method', 'pos_config_self_order_payment_rel', 'config_id', 'payment_method_id', string='Self Online Payments', help="The online payment methods to use when a customer pays a self-order online.", domain=[('is_online_payment', '=', True)])

    @api.constrains('self_order_online_payment_method_ids')
    def _check_self_order_online_payment_method_ids(self):
        for config in self:
            if config.self_ordering_mode == 'mobile' and config.self_ordering_service_mode == 'each':
                for payment_method in config.self_order_online_payment_method_ids:
                    if not payment_method._get_online_payment_providers(config.id, error_if_invalid=True):
                        raise ValidationError(_(
                            "The online payment method '%s' used for self-order must have at least one published payment provider supporting the currency of this POS config.",
                            payment_method.name
                        ))

    def has_valid_self_payment_method(self):
        res = super().has_valid_self_payment_method()
        if self.self_ordering_mode == 'mobile':
            return res or bool(self.self_order_online_payment_method_ids)
        return res
