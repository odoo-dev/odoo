# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models, api


class PosConfig(models.Model):
    _inherit = "pos.config"

    self_ordering_mode = fields.Selection(
        selection_add=[("checkout", "Checkout")],
        ondelete={"checkout": "set default"},
    )

    def _get_self_order_route(self) -> str:
        self.ensure_one()
        base_route = f"/pos-self-checkout/{self.id}"
        return f"{base_route}?access_token={self.access_token}"

    def _get_self_order_url(self) -> str:
        self.ensure_one()
        long_url = self.get_base_url() + self._get_self_order_route()
        return self.env['link.tracker'].search_or_create([{
            'url': long_url,
            'title': f"Self Checkout {self.name}",
        }]).short_url

    def has_valid_self_payment_method(self):
        """ Checks if the POS config has a valid payment method (terminal or online). """
        self.ensure_one()
        domain = self.payment_method_ids._load_pos_self_data_domain({}, self)
        return bool(self.payment_method_ids.filtered_domain(domain))

    @api.model
    def _load_pos_self_data_fields(self, pos_config_id):
        return super()._load_pos_self_data_fields(pos_config_id) + ['logo']
