# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import Command, _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import BinaryBytes
from odoo.tools.image import is_image_size_above

from odoo.addons.html_editor.tools import get_video_embed_code, get_video_thumbnail


class ProductImage(models.Model):
    _name = "product.image"
    _description = "Product Image"
    _inherit = ["image.mixin"]
    _order = "has_attribute_value desc, sequence, id"

    name = fields.Char(string="Name", required=True)
    sequence = fields.Integer(default=10)

    image_1920 = fields.Image()

    product_tmpl_id = fields.Many2one(
        string="Product Template", comodel_name="product.template", ondelete="cascade", index=True
    )
    product_variant_ids = fields.Many2many("product.product")

    video_url = fields.Char(string="Video URL", help="URL of a video for showcasing your product.")
    embed_code = fields.Html(compute="_compute_embed_code", sanitize=False)

    can_image_1024_be_zoomed = fields.Boolean(
        string="Can Image 1024 be zoomed", compute="_compute_can_image_1024_be_zoomed", store=True
    )
    attribute_value_ids = fields.Many2many("product.template.attribute.value")

    has_attribute_value = fields.Boolean(compute="_compute_has_attribute_value", store=True)

    is_primary_or_secondary = fields.Selection(
        [("primary", "Primary"), ("secondary", "Secondary")],
        default=False,
        compute="_compute_primary_secondary",
    )

    # === COMPUTE METHODS ===#

    def _compute_primary_secondary(self):
        for template in self.mapped("product_tmpl_id"):
            tmpl_content = template.image_1920.content
            primary = secondary = None

            for img in template.product_template_image_ids.sorted("sequence"):
                content = img.image_1920.content

                if not primary and content == tmpl_content:
                    primary = img
                    img.is_primary_or_secondary = "primary"
                    continue

                if not secondary and not img.attribute_value_ids and content != tmpl_content:
                    secondary = img
                    img.is_primary_or_secondary = "secondary"
                    continue

                img.is_primary_or_secondary = False

    @api.depends("attribute_value_ids")
    def _compute_has_attribute_value(self):
        for image in self:
            image.has_attribute_value = bool(image.attribute_value_ids)

    @api.depends("image_1920", "image_1024")
    def _compute_can_image_1024_be_zoomed(self):
        for image in self:
            image.can_image_1024_be_zoomed = image.image_1920 and is_image_size_above(
                image.image_1920, image.image_1024
            )

    @api.depends("video_url")
    def _compute_embed_code(self):
        for image in self:
            image.embed_code = (image.video_url and get_video_embed_code(image.video_url)) or False

    # === ONCHANGE METHODS ===#

    @api.onchange("video_url")
    def _onchange_video_url(self):
        if not self.image_1920:
            thumbnail = get_video_thumbnail(self.video_url)
            self.image_1920 = BinaryBytes(thumbnail or b"")

    # === CONSTRAINT METHODS ===#

    @api.constrains("video_url")
    def _check_valid_video_url(self):
        for image in self:
            if image.video_url and not image.embed_code:
                raise ValidationError(
                    _(
                        "Provided video URL for '%s' is not valid. Please enter a valid video URL.",
                        image.name,
                    )
                )

    # === CRUD METHODS ===#

    @api.model_create_multi
    def create(self, vals_list):
        images = super().create(vals_list)
        images._sync_variant_images()
        return images

    def write(self, vals):
        res = super().write(vals)
        if "attribute_value_ids" in vals:
            self._sync_variant_images()
        elif "sequence" in vals or "image_1920" in vals:
            templates = self.mapped("product_tmpl_id")
            variants = self.mapped("product_variant_ids")
            templates._set_main_image_from_extra_images(variants)
        return res

    def unlink(self):
        templates = self.mapped("product_tmpl_id")
        variants = self.mapped("product_variant_ids")
        res = super().unlink()
        templates._set_main_image_from_extra_images(variants)
        return res

    # === BUSINESS METHODS === #

    def _sync_variant_images(self):
        """Update the product variants to which each image applies.

        For each image, this method computes the set of product variants that match the image's
        attribute values and updates the image's linked variants accordingly. Images without
        attribute value are applied to all variants of the template.

        :return: None
        :rtype: None
        """
        impacted_variants = self.env["product.product"]
        for image in self:
            old_variants = image.product_variant_ids

            new_variants = image.product_tmpl_id.product_variant_ids.filtered(
                image._is_applicable_to_variant
            )

            image.product_variant_ids = [Command.set(new_variants.ids)]

            impacted_variants |= old_variants | new_variants

        impacted_variants.mapped("product_tmpl_id")._set_main_image_from_extra_images(
            impacted_variants
        )

    def _is_applicable_to_variant(self, variant):
        """Check whether this image applies to the given product variant.

        The image applies if the variant matches all attribute values set on the image.
        Attributes that are not set do not affect the result.

        :param variant: product.product recordset
        :return: Whether the image applies to the variant or not.
        :rtype: bool
        """
        self.ensure_one()
        variant.ensure_one()

        if not self.attribute_value_ids:
            return True

        variant_vals = {
            ptav.attribute_id.id: ptav.id for ptav in variant.product_template_attribute_value_ids
        }

        image_vals_by_attr = defaultdict(set)
        for val in self.attribute_value_ids:
            image_vals_by_attr[val.attribute_id.id].add(val.id)

        return all(
            variant_vals.get(attr_id) in allowed_vals
            for attr_id, allowed_vals in image_vals_by_attr.items()
        )
