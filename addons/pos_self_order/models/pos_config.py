# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import uuid
import zipfile
from io import BytesIO
from urllib.parse import unquote

import qrcode
import qrcode.image.svg

from odoo import _, api, fields, models, release
from odoo.exceptions import AccessError, UserError, ValidationError


class PosConfig(models.Model):
    _inherit = "pos.config"

    self_ordering_mode = fields.Selection(
        selection_add=[("consultation", "QR menu"), ("mobile", "QR menu + Ordering"), ("kiosk", "Kiosk")],
        ondelete={"consultation": "set default", "mobile": "set default", "kiosk": "set default"},
    )
    self_ordering_service_mode = fields.Selection(
        [("counter", "Pickup zone"), ("table", "Table")],
        string="Self Ordering Service Mode",
        default="counter",
        help="Choose the kiosk mode",
        required=True,
    )
    self_ordering_pay_after = fields.Selection(
        selection=lambda self: self._compute_selection_pay_after(),
        string="Pay After:",
        default="meal",
        help="Choose when the customer will pay",
        required=True,
    )

    @api.model
    def _load_pos_self_data_fields(self, pos_config_id):
        res = super()._load_pos_self_data_fields(pos_config_id)
        return res + ['self_ordering_service_mode', 'self_ordering_pay_after', 'floor_ids']

    @api.model_create_multi
    def create(self, vals_list):
        pos_config_ids = super().create(vals_list)
        pos_config_ids._prepare_self_order_custom_btn()
        return pos_config_ids

    def _prepare_self_order_custom_btn(self):
        for record in self:
            exists = record.env['pos_self_order.custom_link'].search_count([
                ('pos_config_ids', 'in', record.id),
                ('url', '=', f'/pos-self/{record.id}/products')
            ])

            if not exists:
                record.env['pos_self_order.custom_link'].create({
                    'name': _('Order Now'),
                    'url': f'/pos-self/{record.id}/products',
                    'pos_config_ids': [(4, record.id)],
                })

    def write(self, vals):
        for record in self:
            if vals.get('self_ordering_mode') == 'kiosk' or (vals.get('pos_self_ordering_mode') == 'mobile' and vals.get('pos_self_ordering_service_mode') == 'counter'):
                vals['self_ordering_pay_after'] = 'each'

            if (not vals.get('module_pos_restaurant') and not record.module_pos_restaurant) and vals.get('self_ordering_mode') == 'mobile':
                vals['self_ordering_pay_after'] = 'each'

            if (
                vals.get('self_ordering_mode') == 'mobile'
                and (
                    vals.get('self_ordering_service_mode') == 'counter'
                    or (record.self_ordering_service_mode == 'counter' and vals.get('self_ordering_service_mode') != 'table')
                )
            ):
                vals['self_ordering_pay_after'] = 'each'

            if vals.get('self_ordering_mode') == 'mobile' and vals.get('self_ordering_pay_after') == 'meal':
                vals['self_ordering_service_mode'] = 'table'

        res = super().write(vals)
        self._prepare_self_order_custom_btn()
        return res

    @api.depends("module_pos_restaurant")
    def _compute_self_order(self):
        for record in self:
            if not record.module_pos_restaurant and record.self_ordering_mode != 'kiosk':
                record.self_ordering_mode = 'nothing'

    def _compute_selection_pay_after(self):
        selection_each_label = _("Each Order")
        if not release.version_info[-1]:
            selection_each_label = f"{selection_each_label} {_('(require Odoo Enterprise)')}"
        return [("meal", _("Meal")), ("each", selection_each_label)]

    @api.constrains("payment_method_ids", "self_ordering_mode")
    def _onchange_payment_method_ids(self):
        if any(record.self_ordering_mode == 'kiosk' and any(pm.is_cash_count for pm in record.payment_method_ids) for record in self):
            raise ValidationError(_("You cannot add cash payment methods in kiosk mode."))

    def _get_qr_code_data(self):
        self.ensure_one()

        table_qr_code = []
        if self.self_ordering_mode == 'mobile' and self.module_pos_restaurant and self.self_ordering_service_mode == 'table':
            table_qr_code.extend([{
                    'name': floor.name,
                    'type': 'table',
                    'tables': [
                        {
                            'identifier': table.identifier,
                            'id': table.id,
                            'name': table.table_number,
                            'url': self._get_self_order_url(table.id),
                        }
                        for table in floor.table_ids.filtered("active")
                    ]
                }
                for floor in self.floor_ids]
            )
        else:
            # Here we use "range" to determine the number of QR codes to generate from
            # this list, which will then be inserted into a PDF.
            table_qr_code.extend([{
                'name': _('Generic'),
                'type': 'default',
                'tables': [{
                    'id': i,
                    'url': self._get_self_order_url(),
                } for i in range(0, 6)]
            }])

        return table_qr_code

    def _get_self_order_route(self, table_id: int | None = None) -> str:
        self.ensure_one()
        base_route = f"/pos-self/{self.id}"
        table_route = ""

        if self.self_ordering_mode == 'consultation':
            return base_route

        if self.self_ordering_mode == 'mobile':
            table = self.env["restaurant.table"].search(
                [("active", "=", True), ("id", "=", table_id)], limit=1
            )

            if table:
                table_route = f"&table_identifier={table.identifier}"

        return f"{base_route}?access_token={self.access_token}{table_route}"

    def _get_self_order_url(self, table_id: int | None = None) -> str:
        self.ensure_one()
        long_url = self.get_base_url() + self._get_self_order_route(table_id)
        return self.env['link.tracker'].search_or_create([{
            'url': long_url,
            'title': f"Self Order {self.name}" if not table_id else f"Self Order {self.name} - Table id {table_id}",
        }]).short_url

    def _load_self_data_models(self):
        res = super()._load_self_data_models()
        return res + ['pos_self_order.custom_link', 'restaurant.floor', 'restaurant.table']

    def close_ui(self):
        if self.self_ordering_mode == "kiosk":
            return self.action_close_kiosk_session()
        return super().close_ui()

    def action_close_kiosk_session(self):
        if self.current_session_id and self.current_session_id.order_ids:
            self.current_session_id.order_ids.filtered(lambda o: o.state == 'draft').unlink()

        self._notify('STATUS', {'status': 'closed'})
        return self.current_session_id.action_pos_session_closing_control()

    def action_open_wizard(self):
        self.ensure_one()

        if not self.current_session_id:
            res = self._check_before_creating_new_session()
            if res:
                return res
            session = self.env['pos.session'].create({'user_id': self.env.uid, 'config_id': self.id})
            session.set_opening_control(0, "")
            self._notify('STATUS', {'status': 'open'})

        return {
            'type': 'ir.actions.act_url',
            'name': _('Self Order'),
            'target': 'new',
            'url': self.get_kiosk_url(),
        }

    def get_kiosk_url(self):
        return self.self_ordering_url

    def has_valid_self_payment_method(self):
        """ Checks if the POS config has a valid payment method (terminal or online). """
        self.ensure_one()
        domain = self.payment_method_ids._load_pos_self_data_domain({}, self)
        return bool(self.payment_method_ids.filtered_domain(domain))

    @api.model
    def load_onboarding_kiosk_scenario(self):
        if not bool(self.env.company.chart_template):
            return

        journal, payment_methods_ids = self._create_journal_and_payment_methods()
        restaurant_categories = self.get_record_by_ref([
            'pos_restaurant.food',
            'pos_restaurant.drinks',
        ])
        not_cash_payment_methods_ids = self.env['pos.payment.method'].search([
            ('is_cash_count', '=', False),
            ('id', 'in', payment_methods_ids),
        ]).ids
        self.env['pos.config'].create({
            'name': _('Kiosk'),
            'company_id': self.env.company.id,
            'journal_id': journal.id,
            'payment_method_ids': not_cash_payment_methods_ids,
            'limit_categories': True,
            'iface_available_categ_ids': restaurant_categories,
            'iface_splitbill': True,
            'module_pos_restaurant': True,
            'self_ordering_mode': 'kiosk',
            'self_ordering_pay_after': 'each',
        })

    def _load_restaurant_demo_data(self, with_demo_data=True):
        self.ensure_one()
        super()._load_restaurant_demo_data(with_demo_data)
        if with_demo_data:
            self.self_ordering_mode = 'mobile'

    def _generate_single_qr_code__(self, url):  # noqa: PLW3201
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        return {
            'png': qr.make_image(fill_color="black", back_color="transparent"),
            'svg': qr.make_image(fill_color="black", back_color="transparent", image_factory=qrcode.image.svg.SvgImage),
        }

    def get_pos_qr_order_data(self):
        url_form = "https://www.odoo.com/app/point-of-sale-restaurant-qr-code"
        table_data = []
        if self.self_ordering_mode not in ['mobile', 'consultation']:
            return {
                'success': False,
                'error': 'INVALID_SELF_ORDERING_MODE',
            }

        table_ids = None
        if self.module_pos_restaurant:
            table_ids = self.floor_ids.table_ids

        if table_ids and self.self_ordering_mode == 'mobile':
            for table in table_ids:
                url = self._get_self_order_url(table.id)
                table_data.append({
                    'url': url,
                    'name': f"{table.floor_id.name} - {table.table_number}",
                })
        else:
            url = self._get_self_order_url()
            table_data.append({
                'url': url,
                'name': "generic",
            })

        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", 0) as zip_file:
            for index, qr_data in enumerate(table_data, start=1):
                images = self._generate_single_qr_code__(unquote(qr_data['url']))
                with zip_file.open(f"{qr_data['name']} ({index}).png", "w") as buf:
                    images['png'].save(buf, format="PNG")
                with zip_file.open(f"{qr_data['name']} ({index}).svg", "w") as buf:
                    buf.write(images['svg'].to_string())
        zip_buffer.seek(0)

        return {
            'success': True,
            'table_data': table_data,
            'self_ordering_mode': self.self_ordering_mode,
            'db_name': self.env.cr.dbname,
            'redirect_url': url_form,
            'zip_archive': base64.b64encode(zip_buffer.read()).decode('utf-8'),
        }
