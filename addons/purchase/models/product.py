# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import SQL


def _sort_purchased_products(products, limit=100):
    # Helper function to sort purchased products (template and variant.)
    previously_purchased_products = products.filtered('last_purchase_date').sorted(lambda p:
        (p.last_purchase_date, -p.id), reverse=True
    )
    remaining_limit = max(limit - len(previously_purchased_products), 0)
    if remaining_limit:
        remaining_products = (products - previously_purchased_products)[:remaining_limit]
        products = previously_purchased_products + remaining_products.sorted()
    else:
        products = previously_purchased_products
    return products[:limit]


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    purchased_product_qty = fields.Float(compute='_compute_purchased_product_qty', string='Purchased', digits='Product Unit')
    purchase_method = fields.Selection([
        ('purchase', 'On ordered quantities'),
        ('receive', 'On received quantities'),
    ], string="Control Policy", compute='_compute_purchase_method', precompute=True, store=True, readonly=False,
        help="On ordered quantities: Control bills based on ordered quantities.\n"
            "On received quantities: Control bills based on received quantities.")
    purchase_line_warn_msg = fields.Text('Message for Purchase Order Line')
    last_purchase_date = fields.Date(compute='_compute_last_purchase_date')
    last_purchase_since = fields.Char(compute='_compute_last_purchase_date')

    @api.depends_context('partner_id', 'prioritize_for')
    def _compute_last_purchase_date(self):
        self.last_purchase_date = False
        self.last_purchase_since = ''
        if not self._must_prioritize_purchased_product():
            return
        for product_tmpl in self:
            most_recent_purchased_product = max(
                [(p.last_purchase_date, p) for p in product_tmpl.product_variant_ids if p.last_invoice_date],
                default=False)
            product_tmpl.last_invoice_date = most_recent_purchased_product[0]
            product_tmpl.last_invoice_since = most_recent_purchased_product[1].last_invoice_since

    @api.depends('type')
    def _compute_purchase_method(self):
        default_purchase_method = self.env['product.template'].default_get(['purchase_method']).get('purchase_method', 'receive')
        for product in self:
            if product.type == 'service':
                product.purchase_method = 'purchase'
            else:
                product.purchase_method = default_purchase_method

    def _compute_purchased_product_qty(self):
        for template in self:
            template.purchased_product_qty = template.uom_id.round(sum(p.purchased_product_qty for p in template.product_variant_ids))

    def _get_backend_root_menu_ids(self):
        return super()._get_backend_root_menu_ids() + [self.env.ref('purchase.menu_purchase_root').id]

    @api.model
    def get_import_templates(self):
        res = super(ProductTemplate, self).get_import_templates()
        if self.env.context.get('purchase_product_template'):
            return [{
                'label': _('Import Template for Products'),
                'template': '/purchase/static/xls/product_purchase.xls'
            }]
        return res

    def action_view_po(self):
        action = self.env["ir.actions.actions"]._for_xml_id("purchase.action_purchase_history")
        action['domain'] = ['&', ('state', '=', 'purchase'), ('product_id', 'in', self.product_variant_ids.ids)]
        action['display_name'] = _("Purchase History for %s", self.display_name)
        return action

    @api.model
    def _must_prioritize_purchased_product(self):
        return bool(self.env.context.get('partner_id') and self.env.context.get('prioritize_for') == 'purchase')


class ProductProduct(models.Model):
    _inherit = 'product.product'

    purchased_product_qty = fields.Float(compute='_compute_purchased_product_qty', string='Purchased',
        digits='Product Unit')

    is_in_purchase_order = fields.Boolean(
        compute='_compute_is_in_purchase_order',
        search='_search_is_in_purchase_order',
    )
    last_purchase_date = fields.Date(compute='_compute_last_purchase_date')
    last_purchase_since = fields.Char(compute='_compute_last_purchase_date')

    @api.depends_context('formatted_display_name', 'partner_id', 'prioritize_for')
    def _compute_display_name(self):
        super()._compute_display_name()

        # Add last invoiced date beside the product's name.
        if self.env.context.get('formatted_display_name') and\
            self.env['product.template']._must_prioritize_purchased_product():
            for product in self:
                if product.last_purchase_date:
                    product.display_name = f'`{product.last_purchase_since}` **{product.display_name}**'

    @api.depends_context('partner_id', 'prioritize_for')
    def _compute_last_purchase_date(self):
        self.last_purchase_date = False
        self.last_purchase_since = ''
        if not self.env['product.template']._must_prioritize_purchased_product():
            return
        now = fields.Datetime.now()
        partner_id = self.env.context['partner_id']
        products_and_last_purchase_date = self._get_products_and_last_purchase_date(partner_id)
        for product_and_date in products_and_last_purchase_date:
            product = self.browse(product_and_date['product_id'])
            last_purchase_date = product_and_date['last_purchase_date']
            last_purchase_date = last_purchase_date if last_purchase_date <= now else now
            product.last_purchase_date = last_purchase_date
            days_count = (now - last_purchase_date).days
            product.last_purchase_since = self._get_last_invoice_since(days_count)

    def _get_products_and_last_purchase_date(self, partner_id):
        print('\n\n1. Search relevant PO.')
        purchase_order_ids = self.env['purchase.order'].search([
            ('partner_id', '=', partner_id),
            ('state', '=', 'purchase'),
            ('date_approve', '>', (fields.Datetime.now() - relativedelta(years=1))),
        ]).ids
        print(f'\n\n2. Relevant PO found: {len(purchase_order_ids)}.')
        if not purchase_order_ids:
            # No need to search for PO lines if there is no matching PO.
            print('\n\n3. No relevant PO found, no second query.')
            return []
        print('\n\n3. Search most recent purchase date by product.')
        sql_query = SQL("""
            SELECT pol.product_id, MAX(po.date_approve) AS last_purchase_date
            FROM purchase_order_line pol
            JOIN purchase_order po ON pol.order_id = po.id
            WHERE order_id IN %(purchase_order_ids)s
                AND product_id IN %(product_ids)s
            GROUP BY pol.product_id
            """,
            purchase_order_ids=tuple(purchase_order_ids),
            product_ids=tuple(self.ids),
        )
        self.env.cr.execute(sql_query)
        res = self.env.cr.dictfetchall()
        print(f'\n\n4. Result: {res}')
        return res

    def _compute_purchased_product_qty(self):
        date_from = fields.Datetime.to_string(fields.Date.context_today(self) - relativedelta(years=1))
        domain = [
            ('order_id.state', '=', 'purchase'),
            ('product_id', 'in', self.ids),
            ('order_id.date_approve', '>=', date_from)
        ]
        order_lines = self.env['purchase.order.line']._read_group(domain, ['product_id'], ['product_uom_qty:sum'])
        purchased_data = {product.id: qty for product, qty in order_lines}
        for product in self:
            if not product.id:
                product.purchased_product_qty = 0.0
                continue
            product.purchased_product_qty = product.uom_id.round(purchased_data.get(product.id, 0))

    @api.depends_context('order_id')
    def _compute_is_in_purchase_order(self):
        order_id = self.env.context.get('order_id')
        if not order_id:
            self.is_in_purchase_order = False
            return

        read_group_data = self.env['purchase.order.line']._read_group(
            domain=[('order_id', '=', order_id)],
            groupby=['product_id'],
            aggregates=['__count'],
        )
        data = {product.id: count for product, count in read_group_data}
        for product in self:
            product.is_in_purchase_order = bool(data.get(product.id, 0))

    def _search_is_in_purchase_order(self, operator, value):
        if operator != 'in':
            return NotImplemented
        product_ids = self.env['purchase.order.line'].search([
            ('order_id', 'in', [self.env.context.get('order_id', '')]),
        ]).product_id.ids
        return [('id', 'in', product_ids)]

    @api.model
    def name_search(self, name='', domain=None, operator='ilike', limit=100):
        if not name and self.env['product.template']._must_prioritize_purchased_product():
            products = self.search(domain)
            products = _sort_purchased_products(products, limit)
            return [(product.id, product.display_name) for product in products]
        else:
            return super().name_search(name, domain, operator, limit)

    def action_view_po(self):
        action = self.env["ir.actions.actions"]._for_xml_id("purchase.action_purchase_history")
        action['domain'] = ['&', ('state', '=', 'purchase'), ('product_id', 'in', self.ids)]
        action['display_name'] = _("Purchase History for %s", self.display_name)
        return action

    def _get_backend_root_menu_ids(self):
        return super()._get_backend_root_menu_ids() + [self.env.ref('purchase.menu_purchase_root').id]

    @api.model
    def _get_last_invoice_since(self, days_count):
        if days_count > 365:
            return self.env._('%(years_count)sy', years_count=(days_count // 365))
        elif days_count > 30:
            return self.env._('%(months_count)smo', months_count=(days_count // 30))
        else:
            return self.env._('%(days_count)sd', days_count=days_count)

    def _update_uom(self, to_uom_id):
        for uom, product, po_lines in self.env['purchase.order.line']._read_group(
            [('product_id', 'in', self.ids)],
            ['product_uom_id', 'product_id'],
            ['id:recordset'],
        ):
            if uom != product.product_tmpl_id.uom_id:
                raise UserError(_(
                    'As other units of measure (ex : %(problem_uom)s) '
                    'than %(uom)s have already been used for this product, the change of unit of measure can not be done.'
                    'If you want to change it, please archive the product and create a new one.',
                    problem_uom=uom.display_name, uom=product.product_tmpl_id.uom_id.display_name))
            po_lines.product_uom_id = to_uom_id
            po_lines.flush_recordset()

        return super()._update_uom(to_uom_id)

    def _trigger_uom_warning(self):
        res = super()._trigger_uom_warning()
        if res:
            return res
        po_lines = self.env['purchase.order.line'].sudo().search_count(
            [('product_id', 'in', self.ids)], limit=1
        )
        return bool(po_lines)


class ProductSupplierinfo(models.Model):
    _inherit = "product.supplierinfo"

    @api.onchange('partner_id')
    def _onchange_partner_id(self):
        self.currency_id = self.partner_id.property_purchase_currency_id.id or self.env.company.currency_id.id

    def _get_filtered_supplier(self, company_id, product_id, params=False):
        if params and 'order_id' in params and params['order_id'].company_id:
            company_id = params['order_id'].company_id
        return super()._get_filtered_supplier(company_id, product_id, params)
