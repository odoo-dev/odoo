# Part of Odoo. See LICENSE file for full copyright and licensing details.
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError


class PosConfig(models.Model):
    _inherit = "pos.config"

    def _self_order_default_languages(self):
        return self.env["res.lang"].get_installed()

    def _self_order_default_user(self):
        users = self.env["res.users"].search(['|', ('company_ids', 'in', self.env.company.id), ('company_id', '=', False)])
        for user in users:
            if user.sudo().has_group("point_of_sale.group_pos_manager"):
                return user
        return False

    status = fields.Selection(
        [("inactive", "Inactive"), ("active", "Active")],
        string="Status",
        compute="_compute_status",
        store=False,
    )
    self_ordering_url = fields.Char(compute="_compute_self_ordering_url")
    self_ordering_mode = fields.Selection(
        [("nothing", "Disable")],
        string="Self Mode",
        default="nothing",
        help="Choose the self mode",
        required=True,
    )
    self_ordering_default_language_id = fields.Many2one(
        "res.lang",
        string="Default Language",
        help="Default language for the kiosk mode",
        default=lambda self: self.env["res.lang"].search(
            [("code", "=", self.env.lang)], limit=1
        ),
    )
    self_ordering_available_language_ids = fields.Many2many(
        "res.lang",
        string="Available Languages",
        help="Languages available for the kiosk mode",
        default=_self_order_default_languages,
    )
    self_ordering_image_home_ids = fields.Many2many(
        'ir.attachment',
        string="Add images",
        help="Image to display on the self order screen",
        bypass_search_access=True,
    )
    self_ordering_image_background_ids = fields.Many2many(
        'ir.attachment',
        string="Set background image",
        help="Image to be displayed in the background",
        relation="pos_self_order_background_rels",
        bypass_search_access=True,
    )
    self_ordering_default_user_id = fields.Many2one(
        "res.users",
        string="Default User",
        help="Access rights of this user will be used when visiting self order website when no session is open.",
        default=_self_order_default_user,
    )
    self_ordering_image_brand = fields.Image(
        string="Self Order Kiosk Image Brand",
        help="Image to display on the self order screen",
        max_width=1200,
        max_height=250,
    )
    self_ordering_image_brand_name = fields.Char(
        string="Self Order Kiosk Image Brand Name",
        help="Name of the image to display on the self order screen",
    )
    has_paper = fields.Boolean("Has paper", default=True)
    self_ordering_primary_color = fields.Char(string="Color", default=lambda self: self.env.company.email_secondary_color)

    @api.model
    def _load_pos_self_data_fields(self, pos_config_id):
        return ['id', 'name', 'company_id', 'journal_id', 'payment_method_ids', 'limit_categories',
            'iface_available_categ_ids', 'iface_splitbill', 'module_pos_restaurant', 'self_ordering_mode',
            'self_ordering_default_language_id', 'self_ordering_available_language_ids',
            'self_ordering_image_home_ids', 'self_ordering_default_user_id', 'self_ordering_image_brand',
            'self_ordering_image_brand_name', 'currency_id', 'has_paper', 'fiscal_position_ids',
            'is_order_printer', 'iface_print_via_proxy', 'receipt_header', 'receipt_footer', 'proxy_ip',
            'current_session_id', 'pricelist_id', 'available_pricelist_ids',
            'default_fiscal_position_id', 'use_pricelist', 'module_pos_restaurant', 'is_header_or_footer',
            'rounding_method', 'cash_rounding', 'only_round_cash_method', 'has_active_session',
            'available_preset_ids', 'default_preset_id', 'use_presets', 'iface_tax_included',
            'status', 'self_ordering_image_background_ids', 'preparation_printer_ids', 'default_receipt_printer_id',
            'receipt_printer_ids', 'use_order_printer', 'other_devices', 'pos_snooze_ids',
        ]

    def _update_access_token(self):
        self.access_token = uuid.uuid4().hex[:16]
        self.floor_ids.table_ids._update_identifier()

    @api.model_create_multi
    def create(self, vals_list):
        self._prepare_self_order_splash_screen(vals_list, is_new=True)
        pos_config_ids = super().create(vals_list)
        pos_config_ids._ensure_public_attachments()
        return pos_config_ids

    @api.model
    def _prepare_self_order_splash_screen(self, vals_list, is_new=False):
        for vals in vals_list:
            if not vals.get('self_ordering_mode'):
                return True

            if not vals.get('self_ordering_image_home_ids'):
                vals['self_ordering_image_home_ids'] = [(0, 0, {
                    'name': image_name,
                    'type': 'url',
                    'url': f'/pos_self/static/img/{image_name}',
                    'res_model': 'pos.config',
                }) for image_name in ['landing_01.jpg', 'landing_02.jpg', 'landing_03.jpg']]

            if is_new and not vals.get('self_ordering_image_background_ids'):
                vals['self_ordering_image_background_ids'] = [(0, 0, {
                    'name': "background.jpg",
                    'type': 'url',
                    'url': '/pos_self/static/img/kiosk_background.jpg',
                    'res_model': 'pos.config',
                })]

        return True

    def write(self, vals):
        self._prepare_self_order_splash_screen([vals])
        res = super().write(vals)
        self._ensure_public_attachments()
        return res

    def _ensure_public_attachments(self):
        self.self_ordering_image_background_ids.write({"public": True})
        self.self_ordering_image_home_ids.write({"public": True})

    @api.constrains('self_ordering_default_user_id')
    def _check_default_user(self):
        for record in self:
            if (
                record.self_ordering_mode != 'nothing' and (
                not record.self_ordering_default_user_id or (
                record.self_ordering_default_user_id
                and not record.self_ordering_default_user_id.sudo().has_group("point_of_sale.group_pos_user")
                and not record.self_ordering_default_user_id.sudo().has_group("point_of_sale.group_pos_manager")))
            ):
                raise UserError(_("The Self-Order default user must be a POS user"))

    def _get_self_order_route(self, table_id: int | None = None) -> str:
        raise NotImplementedError("The method _get_self_order_route should be implemented in the inheriting class to return the correct route for the self order app.")

    def _get_self_order_url(self, table_id: int | None = None) -> str:
        raise NotImplementedError("The method _get_self_order_url should be implemented in the inheriting class to return the correct URL for the self order app.")

    def preview_self_order_app(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_url",
            "url": self._get_self_order_route(),
            "target": "new",
        }

    def _load_self_data_models(self):
        return ['pos.session', 'pos.preset', 'resource.calendar.attendance', 'pos.order', 'pos.order.line', 'pos.payment', 'pos.payment.method', 'res.partner',
            'res.currency', 'pos.printer', 'pos.category', 'product.template', 'product.product', 'product.combo', 'product.combo.item', 'res.company', 'account.tax',
            'account.tax.group', 'res.country', 'product.category', 'product.pricelist', 'product.pricelist.item', 'account.fiscal.position',
            'res.lang', 'product.attribute', 'product.attribute.custom.value', 'product.template.attribute.line', 'product.template.attribute.value', 'product.tag',
            'decimal.precision', 'uom.uom', 'account.cash.rounding', 'res.country', 'res.country.state', 'mail.template', 'pos.product.template.snooze']

    @api.model
    def _load_pos_self_data_domain(self, data, config):
        return [('id', '=', config.id)]

    @api.model
    def _load_pos_self_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if not read_records:
            return read_records
        record = read_records[0]
        record['_self_ordering_image_home_ids'] = config.self_ordering_image_home_ids.ids
        record['_self_ordering_image_background_ids'] = config.self_ordering_image_background_ids.ids
        record['_pos_special_products_ids'] = config._get_special_products().ids
        record['_self_order_pos'] = True
        return read_records

    def load_self_data(self):
        response = {}
        response['pos.config'] = self.env['pos.config']._load_pos_self_data_search_read(response, self)

        for model in self._load_self_data_models():
            try:
                response[model] = self.env[model]._load_pos_self_data_search_read(response, self)
            except AccessError:
                response[model] = []

        return response

    def load_data_params(self):
        response = {}
        fields = self._load_pos_self_data_fields(self)
        response['pos.config'] = {
            'fields': fields,
            'relations': self.env['pos.session']._load_pos_data_relations('pos.config', fields)
        }

        for model in self._load_self_data_models():
            fields = self.env[model]._load_pos_self_data_fields(self)
            response[model] = {
                'fields': fields,
                'relations': self.env['pos.session']._load_pos_data_relations(model, fields)
            }

        return response

    def _compute_self_ordering_url(self):
        for record in self:
            record.self_ordering_url = record.get_base_url() + record._get_self_order_route()

    def _compute_status(self):
        for record in self:
            record.status = 'active' if record.has_active_session else 'inactive'

    def has_valid_self_payment_method(self):
        """ Checks if the POS config has a valid payment method (terminal or online). """
        self.ensure_one()
        domain = self.payment_method_ids._load_pos_self_data_domain({}, self)
        return bool(self.payment_method_ids.filtered_domain(domain))
