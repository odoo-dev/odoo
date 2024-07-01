# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup
import json

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def _get_default_weight_uom(self):
        return self.env['product.template']._get_weight_uom_name_from_ir_config_parameter()

    def _compute_weight_uom_name(self):
        for package in self:
            package.weight_uom_name = self.env['product.template']._get_weight_uom_name_from_ir_config_parameter()

    carrier_price = fields.Float(string="Shipping Cost")
    delivery_type = fields.Selection(related='carrier_id.delivery_type', readonly=True)
    carrier_id = fields.Many2one("delivery.carrier", string="Carrier", check_company=True)
    weight = fields.Float(compute='_cal_weight', digits='Stock Weight', store=True, help="Total weight of the products in the picking.", compute_sudo=True)
    carrier_tracking_ref = fields.Char(string='Tracking Reference', copy=False)
    carrier_tracking_url = fields.Char(string='Tracking URL', compute='_compute_carrier_tracking_url')
    weight_uom_name = fields.Char(string='Weight unit of measure label', compute='_compute_weight_uom_name', readonly=True, default=_get_default_weight_uom)
    is_return_picking = fields.Boolean(compute='_compute_return_picking')
    return_label_ids = fields.One2many('ir.attachment', compute='_compute_return_label')
    destination_country_code = fields.Char(related='partner_id.country_id.code', string="Destination Country")

    @api.depends('carrier_id', 'carrier_tracking_ref')
    def _compute_carrier_tracking_url(self):
        for picking in self:
            picking.carrier_tracking_url = picking.carrier_id.get_tracking_link(picking) if picking.carrier_id and picking.carrier_tracking_ref else False

    @api.depends('carrier_id', 'move_ids_without_package')
    def _compute_return_picking(self):
        for picking in self:
            if picking.carrier_id and picking.carrier_id.can_generate_return:
                picking.is_return_picking = any(m.origin_returned_move_id for m in picking.move_ids_without_package)
            else:
                picking.is_return_picking = False

    def _compute_return_label(self):
        for picking in self:
            if picking.carrier_id:
                picking.return_label_ids = self.env['ir.attachment'].search([('res_model', '=', 'stock.picking'), ('res_id', '=', picking.id), ('name', '=like', '%s%%' % picking.carrier_id.get_return_label_prefix())])
            else:
                picking.return_label_ids = False

    def get_multiple_carrier_tracking(self):
        self.ensure_one()
        try:
            return json.loads(self.carrier_tracking_url)
        except (ValueError, TypeError):
            return False

    @api.depends('move_ids.weight')
    def _cal_weight(self):
        for picking in self:
            picking.weight = sum(move.weight for move in picking.move_ids if move.state != 'cancel')

    def _send_confirmation_email(self):
        for pick in self:
            if pick.carrier_id and pick.carrier_id.integration_level == 'rate_and_ship' and pick.picking_type_code != 'incoming' and not pick.carrier_tracking_ref and pick.picking_type_id.print_label:
                pick.sudo().send_to_shipper()
            pick._check_carrier_details_compliance()
        return super(StockPicking, self)._send_confirmation_email()

    def send_to_shipper(self):
        self.ensure_one()
        res = self.carrier_id.send_shipping(self)[0]
        if self.carrier_id.free_over and self.sale_id:
            amount_without_delivery = self.sale_id._compute_amount_total_without_delivery()
            if self.carrier_id._compute_currency(self.sale_id, amount_without_delivery, 'pricelist_to_company') >= self.carrier_id.amount:
                res['exact_price'] = 0.0
        self.carrier_price = self.carrier_id._apply_margins(res['exact_price'])
        if res['tracking_number']:
            related_pickings = self.env['stock.picking'] if self.carrier_tracking_ref and res['tracking_number'] in self.carrier_tracking_ref else self
            accessed_moves = previous_moves = self.move_ids.move_orig_ids
            while previous_moves:
                related_pickings |= previous_moves.picking_id
                previous_moves = previous_moves.move_orig_ids - accessed_moves
                accessed_moves |= previous_moves
            accessed_moves = next_moves = self.move_ids.move_dest_ids
            while next_moves:
                related_pickings |= next_moves.picking_id
                next_moves = next_moves.move_dest_ids - accessed_moves
                accessed_moves |= next_moves
            without_tracking = related_pickings.filtered(lambda p: not p.carrier_tracking_ref)
            without_tracking.carrier_tracking_ref = res['tracking_number']
            for p in related_pickings - without_tracking:
                p.carrier_tracking_ref += "," + res['tracking_number']
        order_currency = self.sale_id.currency_id or self.company_id.currency_id
        msg = _("Shipment sent to carrier %(carrier_name)s for shipping with tracking number %(ref)s",
                carrier_name=self.carrier_id.name,
                ref=self.carrier_tracking_ref) + \
              Markup("<br/>") + \
              _("Cost: %(price).2f %(currency)s",
                price=self.carrier_price,
                currency=order_currency.name)
        self.message_post(body=msg)
        self._add_delivery_cost_to_so()

    def _check_carrier_details_compliance(self):
        """Hook to check if a delivery is compliant in regard of the carrier.
        """
        return

    def print_return_label(self):
        self.ensure_one()
        self.carrier_id.get_return_label(self)

    def _get_matching_delivery_lines(self):
        return self.sale_id.order_line.filtered(
            lambda l: l.is_delivery
            and l.currency_id.is_zero(l.price_unit)
            and l.product_id == self.carrier_id.product_id
        )

    def _prepare_sale_delivery_line_vals(self):
        return {
            'price_unit': self.carrier_price,
            # remove the estimated price from the description
            'name': self.carrier_id.with_context(lang=self.partner_id.lang).name,
        }

    def _add_delivery_cost_to_so(self):
        self.ensure_one()
        sale_order = self.sale_id
        if sale_order and self.carrier_id.invoice_policy == 'real' and self.carrier_price:
            delivery_lines = self._get_matching_delivery_lines()
            if not delivery_lines:
                delivery_lines = sale_order._create_delivery_line(self.carrier_id, self.carrier_price)
            vals = self._prepare_sale_delivery_line_vals()
            delivery_lines[0].write(vals)

    def open_website_url(self):
        self.ensure_one()
        if not self.carrier_tracking_url:
            raise UserError(_("Your delivery method has no redirect on courier provider's website to track this order."))

        carrier_trackers = []
        try:
            carrier_trackers = json.loads(self.carrier_tracking_url)
        except ValueError:
            carrier_trackers = self.carrier_tracking_url
        else:
            msg = _("Tracking links for shipment:") + Markup("<br/>")
            for tracker in carrier_trackers:
                msg += Markup('<a href="%s">%s</a><br/>') % (tracker[1], tracker[0])
            self.message_post(body=msg)
            return self.env["ir.actions.actions"]._for_xml_id("stock_delivery.act_delivery_trackers_url")

        client_action = {
            'type': 'ir.actions.act_url',
            'name': "Shipment Tracking Page",
            'target': 'new',
            'url': self.carrier_tracking_url,
        }
        return client_action

    def cancel_shipment(self):
        for picking in self:
            picking.carrier_id.cancel_shipment(self)
            msg = "Shipment %s cancelled" % picking.carrier_tracking_ref
            picking.message_post(body=msg)
            picking.carrier_tracking_ref = False

    def _get_estimated_weight(self):
        self.ensure_one()
        weight = 0.0
        for move in self.move_ids:
            weight += move.product_qty * move.product_id.weight
        return weight

    def _should_generate_commercial_invoice(self):
        self.ensure_one()
        return self.picking_type_id.warehouse_id.partner_id.country_id != self.partner_id.country_id
