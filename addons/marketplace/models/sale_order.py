from odoo import _, api, fields, models


class SaleOrder(models.Model):
    _inherit = "sale.order"

    marketplace_order_identifier = fields.Char(
        string="Marketplace Order Identifier",
        readonly=True,
    )
    fulfillment_type = fields.Selection(
        string="Fulfillment Type",
        selection=[
            ('FBMe', "Merchant"),
            ('FBMa', "Marketplace"),
        ],
    )

    marketplace_account_id = fields.Many2one(
        comodel_name="marketplace.account",
        string="Marketplace Account",
        readonly=True,
        ondelete='restrict',
    )

    _unique_marketplace_account_marketplace_order_identifier = models.Constraint(
        "UNIQUE(marketplace_account_id, marketplace_order_identifier)",
        "Marketplace order identifier should be unique per marketplace account."
    )

    def _marketplace_create_activity_resolve_fulfillment_conflict(self, user_id, fulfillment_type):
        """ Create an activity on the Marketplace sale order for the salesperson to resolve
        the conflict of fulfillments received from Marketplace when order is fulfilled by Merchant.
        Or when order is fulfilled by Marketplace and there are pickings linked to the order.

        :param int user_id: The salesperson of the related Marketplace account.
        :param str fulfillment_type: `FBMe` or `FBMa`.
        :return: None.
        """
        activity_message = _(
            "This Marketplace sale order is fulfilled by Merchant but it received fulfillments" \
            " from the Marketplace. Please resolve this conflict.",
        ) if fulfillment_type == 'FBMe' else _(
            "This Marketplace sale order is fulfilled by the Marketplace but there are pickings" \
            " linked to the order. Please resolve this conflict.",
        )
        self.activity_schedule(
            act_type_xmlid='mail.mail_activity_data_todo',
            user_id=user_id,
            note=activity_message,
        )
