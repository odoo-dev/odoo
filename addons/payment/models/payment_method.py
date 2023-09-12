# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PaymentMethod(models.Model):
    _name = 'payment.method'
    _description = "Payment Method"
    _order = 'sequence, name'

    name = fields.Char(string="Name", required=True)
    sequence = fields.Integer(string="Sequence", default=1)
    code = fields.Char(
        string="Code", help="The technical code of this payment method.", required=True
    )
    parent_id = fields.Many2one(
        string="Parent", help="The parent payment method", comodel_name='payment.method'
    )
    brand_ids = fields.One2many(
        string="Brands",
        help="The brands of the payment methods that will be displayed on the payment form.",
        comodel_name='payment.method',
        inverse_name='parent_id',
    )
    provider_ids = fields.Many2many(
        string="Providers",
        help="The list of providers supporting this payment method.",
        comodel_name='payment.provider',
    )
    image = fields.Image(
        string="Image",
        help="The base image used for this payment method; in a 64x64 px format.",
        max_width=64,
        max_height=64,
        required=True,
    )
    image_payment_form = fields.Image(
        string="The resized image displayed on the payment form.",
        related='image',
        store=True,
        max_width=45,
        max_height=30,
    )

    # TODO
    support_tokenization = fields.Boolean(
        string="Tokenization Supported",
        # compute='_compute_feature_support_fields',
    )
    support_manual_capture = fields.Selection(
        string="Manual Capture Supported",
        selection=[('full_only', "Full Only"), ('partial', "Partial")],
        # compute='_compute_feature_support_fields',
    )
    support_express_checkout = fields.Boolean(
        string="Express Checkout Supported",
        # compute='_compute_feature_support_fields'
    )
    support_refund = fields.Selection(
        string="Type of Refund Supported",
        selection=[('full_only', "Full Only"), ('partial', "Partial")],
        # compute='_compute_feature_support_fields',
    )
    supported_country_ids = fields.Many2many(
        string="Supported Countries", comodel_name='res.country'
    )
    supported_currency_ids = fields.Many2many(
        string="Supported Currencies", comodel_name='res.currency'
    )

    # === BUSINESS METHODS === #

    def _get_compatible_payment_methods(self, provider_ids):
        """ Select and return the payment methods matching the compatibility criteria.

        The compatibility criteria are that payment methods must: be supported by at least one of
        the providers; be top-level payment methods (not a brand). If provided, the optional keyword
        arguments further refine the criteria.

        :param list provider_ids: The list of providers by which the payment methods must be at
                                  least partially supported to be considered compatible, as a list
                                  of `payment.provider` ids.
        :return: The compatible payment methods.
        :rtype: payment.method
        """
        return self.search([('provider_ids', 'in', provider_ids), ('parent_id', '=', False)])

    def _get_from_code(self, code, mapping=None):
        """ Get the payment method corresponding to the given provider-specific code.

        If a mapping is given, the search uses the generic payment method code that corresponds to
        the given provider-specific code.

        :param str code: The provider-specific code of the payment method to get.
        :param dict mapping: A non-exhaustive mapping of generic payment method codes to
                             provider-specific codes.
        :return: The corresponding payment method, if any.
        :type: payment.method
        """
        generic_to_specific_mapping = mapping or {}
        specific_to_generic_mapping = {v: k for k, v in generic_to_specific_mapping.items()}
        return self.search([('code', '=', specific_to_generic_mapping.get(code, code))], limit=1)
