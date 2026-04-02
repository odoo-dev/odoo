import zipfile
from io import BytesIO

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from odoo.fields import Domain
from odoo.tools.misc import split_every
from werkzeug.urls import url_unquote


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_self_ordering_mode = fields.Selection(related="pos_config_id.self_ordering_mode", readonly=False, required=True)
    pos_self_ordering_default_language_id = fields.Many2one(related="pos_config_id.self_ordering_default_language_id", readonly=False)
    pos_self_ordering_available_language_ids = fields.Many2many(related="pos_config_id.self_ordering_available_language_ids", readonly=False)
    pos_self_ordering_image_home_ids = fields.Many2many(related="pos_config_id.self_ordering_image_home_ids", readonly=False)
    pos_self_ordering_image_background_ids = fields.Many2many(related="pos_config_id.self_ordering_image_background_ids", readonly=False)
    pos_self_ordering_image_brand = fields.Image(related="pos_config_id.self_ordering_image_brand", readonly=False)
    pos_self_ordering_image_brand_name = fields.Char(related="pos_config_id.self_ordering_image_brand_name", readonly=False)
    pos_self_ordering_default_user_id = fields.Many2one(related="pos_config_id.self_ordering_default_user_id", readonly=False)
    pos_self_ordering_primary_color = fields.Char(related="pos_config_id.self_ordering_primary_color", readonly=False)

    @api.onchange("pos_self_ordering_default_language_id", "pos_self_ordering_available_language_ids")
    def _onchange_pos_self_order_default_language(self):
        if self.pos_self_ordering_default_language_id not in self.pos_self_ordering_available_language_ids:
            self.pos_self_ordering_available_language_ids = self.pos_self_ordering_available_language_ids + self.pos_self_ordering_default_language_id
        if not self.pos_self_ordering_default_language_id and self.pos_self_ordering_available_language_ids:
            self.pos_self_ordering_default_language_id = self.pos_self_ordering_available_language_ids[0]

    def preview_self_order_app(self):
        self.ensure_one()
        return self.pos_config_id.preview_self_order_app()

    def update_access_tokens(self):
        self.ensure_one()
        self.pos_config_id._update_access_token()
