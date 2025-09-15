# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models
from odoo.exceptions import UserError
from odoo.tools import groupby


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    marketplace_order_identifier = fields.Char(
        related='sale_id.marketplace_order_identifier'
    )
    marketplace_picking_identifier = fields.Char(
        string="Marketplace Picking Identifier",
        readonly=True,
    )
    # state = fields.Selection(
    #     selection_add=[('delivered', 'Delivered')],
    # )
    marketplace_sync_status = fields.Selection(
        string="Marketplace Synchronization Status",
        help="The synchronization status of the delivery order to the marketplace:\n"
             "- Pending: The delivery order has been confirmed and will soon be synchronized.\n"
             "- Done: The delivery details have been processed.\n"
             "- Error: The synchronization of the delivery order failed.",
        selection=[
            ('pending', "Pending"),
            ('done', "Done"),
            ('error', "Error"),
        ],
        readonly=True,
        default='pending',
    )

    # === ACTION METHODS ===#

    def action_push_deliveries_to_marketplace(self):
        self._push_deliveries_to_marketplace()

    def action_push_failed_deliveries_to_marketplace(self):
        self = self.filtered(
            lambda delivery: delivery.state == 'done' and delivery.marketplace_sync_status == 'error'
        )
        self._push_deliveries_to_marketplace()

    # === BUSINESS METHODS ===#

    def _push_deliveries_to_marketplace(self):
        deliveries = self.filtered(
            lambda delivery: delivery.sale_id and delivery.sale_id.marketplace_account_id
        )
        if not deliveries:
            return {
                "type": "ir.actions.client",
                "tag": "display_notification",
                "params": {
                    "type": "warning",
                    "message": _("There are no deliveries which are connected to sale order associated with a marketplace account."),
                    "next": {"type": "ir.actions.act_window_close"},
                }
            }
        accounts = groupby(deliveries, key=lambda delivery: delivery.sale_id.marketplace_account_id)
        errors = []
        for account, deliveries in accounts:
            deliveries_rs = self.env['stock.picking'].browse([d.id for d in deliveries])
            result = account._push_deliveries_to_marketplace(deliveries_rs)
            if result.get("errors"):
                errors.append(result.get("errors"))
        notification_type = "success"
        notification_message = "Successfully pushed fulfillment to Marketplace(s)."
        if errors:
            notification_type = "warning"
            notification_message = "There is issue during push fulfillment to Marketplace(s)."
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "type": notification_type,
                "message": _(notification_message),
                "next": {"type": "ir.actions.act_window_close"},
            }
        }

    def _check_carrier_details_compliance(self):
        """ Check that a picking has a `carrier_tracking_ref`.

        This allows to block a picking to be validated as done if the `carrier_tracking_ref` is
        missing. This is necessary because some Marketplaces requires a tracking reference based
        on the carrier.

        :raise: UserError if `carrier_id` or `carrier_tracking_ref` is missing
        """
        marketplace_pickings_sudo = self.sudo().filtered(
            lambda p: p.sale_id
            and p.sale_id.marketplace_account_id
        )  # In sudo mode to read the field on sale.order
        for picking_sudo in marketplace_pickings_sudo:
            if not picking_sudo.carrier_id.name:
                raise UserError(_(
                    "Marketplace requires that a tracking reference is provided with each delivery. You "
                    "need to assign a carrier to this delivery."
                ))
            if not picking_sudo.carrier_tracking_ref:
                raise UserError(_(
                    "Marketplace requires that a tracking reference is provided with each delivery. "
                    "Since the current carrier doesn't automatically provide a tracking reference, "
                    "you need to set one manually."
                ))
        return super()._check_carrier_details_compliance()
