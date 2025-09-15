from odoo import _, api, fields, models
from odoo.exceptions import UserError


# user account ---> marketplace.account
# sales channel ---> marketplace.channel
# online marketplace ---> marketplace.marketplace
# records of all available marketplace integrations.
class MarketplaceChannel(models.Model):
    _name = "marketplace.channel"
    _description = "Marketplace Channel"
    _order = 'sequence, id'

    name = fields.Char(
        string="Marketplace Channel Name",
        required=True,
    )
    code = fields.Char(
        string="Marketplace Channel Code",
        help="Unique code for the marketplace channel",
        required=True,
    )
    image_128 = fields.Image(
        string="Logo",
    )
    type = fields.Selection(
        string="Type",
        selection=[
            ('ecommerce_platform', "eCommerce Platform"), # shopping cart software
            ('online_marketplace', "Online Marketplace"),
        ],
        required=True,
    )

    active = fields.Boolean(
        string="Active",
        default=True,
    )
    sequence = fields.Integer()

    support_location = fields.Boolean(
        string="Support Location",
        default=True,
        help="Indicates whether this marketplace integration supports multiple stock locations."
    )

    # support_shipping = fields.Boolean(
    #     string="Support Shipping",
    #     help="Indicates whether this marketplace integration supports shipping operations. "
    # )

    _uniq_name = models.Constraint(
        "UNIQUE(name)",
        "The name of the marketplace channel must be unique."
    )
    _uniq_code = models.Constraint(
        "UNIQUE(code)",
        "The code of the marketplace channel must be unique."
    )

    @api.ondelete(at_uninstall=False)
    def _unlink_except_master_data(self):
        """ Prevent the deletion of the marketplace channel if it has an xmlid. """
        external_ids = self.get_external_id()
        for channel in self:
            external_id = external_ids[channel.id]
            if external_id and not external_id.startswith("__export__"):
                raise UserError(_(
                    "You cannot delete the marketplace channel %s; disable it or uninstall it"
                    " instead.", channel.name
                ))

    def open_marketplace_account_list(self):
        """ Method for open marketplace account list."""
        marketplaces = self.env['marketplace.account'].search([('marketplace_channel_id', '=', self.id)])
        action_marketplace = {
            'name': "Marketplace Account",
            'type': 'ir.actions.act_window',
            'res_model': 'marketplace.account',
            'context': {
                'default_marketplace_channel_id': self.id,
                'default_name': self.name,
            },
        }
        if marketplaces:
            action_marketplace.update({
                'view_mode': 'list,form',
                'domain': [('marketplace_channel_id', '=', self.id)],
            })
        else:
            action_marketplace.update({'view_mode': 'form',})
        return action_marketplace
