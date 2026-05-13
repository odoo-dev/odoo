# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
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
        string="Product Template",
        comodel_name="product.template",
        ondelete="cascade",
        required=True,
        index=True,
    )

    video_url = fields.Char(string="Video URL", help="URL of a video for showcasing your product.")
    embed_code = fields.Html(compute="_compute_embed_code", sanitize=False)

    can_image_1024_be_zoomed = fields.Boolean(
        string="Can Image 1024 be zoomed", compute="_compute_can_image_1024_be_zoomed", store=True
    )

    attribute_value_ids = fields.Many2many("product.template.attribute.value")
    has_attribute_value = fields.Boolean(compute="_compute_has_attribute_value", store=True)
    image_type = fields.Selection(
        selection=[("primary", "Primary"), ("secondary", "Secondary")],
        default=False,
    )

    # === COMPUTE METHODS ===#

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

    @api.depends("attribute_value_ids")
    def _compute_has_attribute_value(self):
        for image in self:
            image.has_attribute_value = bool(image.attribute_value_ids)

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
                    image.env._(
                        "Provided video URL for '%s' is not valid. Please enter a valid video URL.",
                        image.name,
                    )
                )

    # === CRUD METHODS ===#

    def write(self, vals):
        res = super().write(vals)

        if "sequence" in vals or "attribute_value_ids" in vals:
            self.product_tmpl_id._update_images_type()
        return res
