from odoo import models
from odoo.tools import populate


class PosOrder(models.Model):
    _inherit = "pos.order"
    _populate_sizes = {"small": 100, "medium": 2_000, "large": 10_000}
    _populate_dependencies = []

    def _populate_factories(self):
        session_ids = self.env.registry.populated_models.get("pos.session", []) or self.env["pos.session"].search([]).ids
        return [
            ("name", populate.constant('POS_ORDER_{counter}')),
            ("session_id", populate.randomize(session_ids)),
            ("amount_total", populate.randint(100, 3000)),
            ("amount_paid", populate.randint(100, 3000)),
            ("amount_return", populate.randint(5, 500)),
            ("amount_tax", populate.randint(5, 500)),
            ("company_id", populate.constant(1)),
            ("state", populate.constant("paid")),
        ]


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"
    _populate_sizes = {"small": 100, "medium": 2_000, "large": 10_000}
    _populate_dependencies = ["pos.order"]

    def _populate_factories(self):
        order_ids = self.env.registry.populated_models["pos.order"]
        product_ids = self.env["product.product"].search([]).ids
        return [
            ("name", populate.constant('POS_ORDER_LINE_{counter}')),
            ("order_id", populate.randomize(order_ids)),
            ("product_id", populate.randomize(product_ids)),
            ("price_subtotal", populate.randint(5, 500)),
            ("price_subtotal_incl", populate.randint(5, 500)),
        ]


class PosPayment(models.Model):
    _inherit = "pos.payment"
    _populate_sizes = {"small": 100, "medium": 2_000, "large": 10_000}
    _populate_dependencies = ["pos.order"]

    def _populate_factories(self):
        order_ids = self.env.registry.populated_models["pos.order"]
        # Used only bank payment method since other will not allowed in all config
        payment_method_ids = self.env["pos.payment.method"].search([('name', '=', 'Bank')]).ids
        return [
            ("pos_order_id", populate.randomize(order_ids)),
            ("payment_method_id", populate.randomize(payment_method_ids)),
            ("amount", populate.randint(5, 500)),
        ]
