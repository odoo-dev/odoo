from odoo import models, api, fields


class PosPreset(models.Model):
    _inherit = "pos.preset"

    available_in_self = fields.Boolean(string='Available in self', default=False)
    service_at = fields.Selection(
        [("counter", "Pickup zone"), ("table", "Table"), ("delivery", "Delivery")],
        string="Service at",
        default="counter",
        required=True,
    )
    delivery_product_id = fields.Many2one(
        comodel_name="product.product",
        string="Delivery Product",
        default=lambda self: (
            self.env.ref("pos_self_order.product_delivery_template", raise_if_not_found=False)
            or self.env["product.template"]
        ).with_context(active_test=False).product_variant_ids[:1],
        help="Product used for delivery fees in self order.",
    )
    delivery_product_price = fields.Float(
        string="Fixed Price",
        default=0.0,
    )
    free_delivery_min_amount = fields.Float(
        string="Free if order amount is above",
        help="Delivery is free when the order total reaches this amount.",
    )
    mail_template_id = fields.Many2one(
        string="Email Confirmation",
        comodel_name='mail.template',
        domain="[('model', '=', 'pos.order')]",
    )

    # will be overridden.
    @api.model
    def _load_pos_self_data_domain(self, data):
        return ['|', ('id', '=', data['pos.config'].default_preset_id.id), '&', ('available_in_self', '=', True), ('id', 'in', data['pos.config'].available_preset_ids.ids)]

    @api.model
    def _load_pos_self_data_fields(self, config):
        params = super()._load_pos_self_data_fields(config)
        params.extend(['service_at', 'mail_template_id', 'free_delivery_min_amount', 'delivery_product_id', 'delivery_product_price',
                       'service_fee', 'service_fee_product_id', 'service_fee_type', 'service_fee_amount', 'service_fee_based_on'])
        return params

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        params.extend(['mail_template_id', 'service_at'])
        return params

    def _can_return_content(self, field_name=None, access_token=None):
        if field_name in ["image_128", "image_512"]:
            return True
        return super()._can_return_content(field_name, access_token)
