# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class Product(models.Model):
    _inherit = 'product.product'

    ribbon_id = fields.Many2one(string="Variant Ribbon", comodel_name='product.ribbon')
    website_id = fields.Many2one(related='product_tmpl_id.website_id', readonly=False)

    product_variant_image_ids = fields.One2many(
        string="Extra Variant Images",
        comodel_name='product.image',
        inverse_name='product_variant_id',
    )

    base_unit_count = fields.Float(
        string="Base Unit Count",
        help="Display base unit price on your eCommerce pages. Set to 0 to hide it for this"
             " product.",
        required=True,
        default=1,
    )
    base_unit_id = fields.Many2one(
        string="Custom Unit of Measure",
        help="Define a custom unit to display in the price per unit of measure field.",
        comodel_name='website.base.unit',
    )
    base_unit_price = fields.Monetary(
        string="Price Per Unit",
        compute='_compute_base_unit_price',
    )
    base_unit_name = fields.Char(
        help="Displays the custom unit for the products if defined or the selected unit of measure"
            " otherwise.",
        compute='_compute_base_unit_name',
    )

    website_url = fields.Char(
        string="Website URL",
        help="The full URL to access the document through the website.",
        compute='_compute_product_website_url',
    )

    #=== COMPUTE METHODS ===#

    def _get_base_unit_price(self, price):
        self.ensure_one()
        return self.base_unit_count and price / self.base_unit_count

    @api.depends('lst_price', 'base_unit_count')
    def _compute_base_unit_price(self):
        for product in self:
            if not product.id:
                product.base_unit_price = 0
            else:
                product.base_unit_price = product._get_base_unit_price(product.lst_price)

    @api.depends('uom_name', 'base_unit_id')
    def _compute_base_unit_name(self):
        for product in self:
            product.base_unit_name = product.base_unit_id.name or product.uom_name

    @api.depends_context('lang')
    @api.depends('product_tmpl_id.website_url', 'product_template_attribute_value_ids')
    def _compute_product_website_url(self):
        for product in self:
            attributes = ','.join(str(x) for x in product.product_template_attribute_value_ids.ids)
            product.website_url = "%s#attr=%s" % (product.product_tmpl_id.website_url, attributes)

    #=== CONSTRAINT METHODS ===#

    @api.constrains('base_unit_count')
    def _check_base_unit_count(self):
        if any(product.base_unit_count < 0 for product in self):
            raise ValidationError(_(
                "The value of Base Unit Count must be greater than 0."
                " Use 0 to hide the price per unit on this product."
            ))

    #=== BUSINESS METHODS ===#

    def _prepare_variant_values(self, combination):
        variant_dict = super()._prepare_variant_values(combination)
        variant_dict['base_unit_count'] = self.base_unit_count
        return variant_dict

    def website_publish_button(self):
        self.ensure_one()
        return self.product_tmpl_id.website_publish_button()

    def open_website_url(self):
        self.ensure_one()
        res = self.product_tmpl_id.open_website_url()
        res['url'] = self.website_url
        return res

    def _get_images(self):
        """Return a list of records implementing `image.mixin` to
        display on the carousel on the website for this variant.

        This returns a list and not a recordset because the records might be
        from different models (template, variant and image).

        It contains in this order: the main image of the variant (if set), the
        Variant Extra Images, and the Template Extra Images.
        """
        self.ensure_one()
        variant_images = list(self.product_variant_image_ids)
        if self.image_variant_1920:
            # if the main variant image is set, display it first
            variant_images = [self] + variant_images
        else:
            # If the main variant image is empty, it will fallback to template
            # image, in this case insert it after the other variant images, so
            # that all variant images are first and all template images last.
            variant_images = variant_images + [self]
        # [1:] to remove the main image from the template, we only display
        # the template extra images here
        return variant_images + self.product_tmpl_id._get_images()[1:]

    def _get_combination_info_variant(self, **kwargs):
        """Return the variant info based on its combination.
        See `_get_combination_info` for more information.
        """
        self.ensure_one()
        return self.product_tmpl_id._get_combination_info(
            combination=self.product_template_attribute_value_ids,
            product_id=self.id,
            **kwargs)

    def _website_show_quick_add(self):
        website = self.env['website'].get_current_website()
        return self.sale_ok and (not website.prevent_zero_price_sale or self._get_contextual_price())

    def _is_add_to_cart_allowed(self):
        self.ensure_one()
        website = self.env['website'].get_current_website()
        is_allowed = (self.user_has_groups('base.group_system')
                      or (self.active and self.sale_ok and self.website_published
                          and not (website.ecommerce_access == 'logged'
                                   and self.env.user._is_public())))
        return is_allowed

    def _get_contextual_price_tax_selection(self):
        self.ensure_one()
        price = self._get_contextual_price()
        product_taxes = self.sudo().taxes_id.filtered(lambda x: x.company_id in self.env.company.parent_ids)
        if product_taxes:
            website = self.env['website'].get_current_website()
            fiscal_position = website.sudo().fiscal_position_id

            price = self._get_tax_included_unit_price(
                website.company_id,
                website.currency_id,
                fields.Date.context_today(self),
                'sale',
                fiscal_position=fiscal_position,
                product_price_unit=price,
                product_currency=website.currency_id,
            )
            line_tax_type = website.show_line_subtotals_tax_selection
            tax_display = "total_included" if line_tax_type == "tax_included" else "total_excluded"

            taxes = fiscal_position.map_tax(product_taxes)
            price = taxes.compute_all(price, product=self, partner=self.env['res.partner'])[tax_display]
        return price
