# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class DeliveryRateChoice(models.TransientModel):
    _name = "delivery.rate.choice"
    _description = "Rate Shopping Variant"

    wizard_id = fields.Many2one(
        comodel_name="choose.delivery.carrier",
        ondelete="cascade",
        required=True,
    )
    currency_id = fields.Many2one(related="wizard_id.currency_id")
    token = fields.Char(
        help="Opaque provider-issued identifier replayed at ship time to ship the exact"
        " service the customer picked.",
    )
    label = fields.Char(string="Service")
    price = fields.Float()
    display_price = fields.Float(string="Cost")
    delivery_eta = fields.Char(string="Estimated Delivery")
    warning_message = fields.Text()

    def action_select(self):
        self.ensure_one()
        self.wizard_id.write({
            "selected_rate_id": self.id,
            "delivery_price": self.price,
            "display_price": self.display_price,
            "delivery_message": self.warning_message or False,
        })
        return {
            "type": "ir.actions.act_window",
            "view_mode": "form",
            "res_model": "choose.delivery.carrier",
            "res_id": self.wizard_id.id,
            "target": "new",
        }
