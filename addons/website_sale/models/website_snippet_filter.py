# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class WebsiteSnippetFilter(models.Model):
    _inherit = 'website.snippet.filter'

    @api.model
    def _get_website_currency(self):
        pricelist = self.env['website'].get_current_website().get_current_pricelist()
        return pricelist.currency_id

    def _get_hardcoded_sample(self, model):
        samples = super()._get_hardcoded_sample(model)
        if model and model.model == 'product.product':
            data = [{
                'image_512': '/product/static/img/product_chair.png',
                'display_name': _('Chair'),
                'description_sale': _('Sit comfortably'),
            }, {
                'image_512': '/product/static/img/product_lamp.png',
                'display_name': _('Lamp'),
                'description_sale': _('Lightbulb sold separately'),
            }, {
                'image_512': '/product/static/img/product_product_20-image.png',
                'display_name': _('Whiteboard'),
                'description_sale': _('With three feet'),
            }, {
                'image_512': '/product/static/img/product_product_27-image.png',
                'display_name': _('Drawer'),
                'description_sale': _('On wheels'),
            }]
            merged = []
            for index in range(0, max(len(samples), len(data))):
                merged.append({**samples[index % len(samples)], **data[index % len(data)]})
                # merge definitions
            samples = merged
        return samples

    def _get_products(self, website, product_source, limit, context):
        handler = getattr(self, '_get_products_%s' % product_source, self._get_products_category)
        products = handler(website, limit, context)
        return products

    def _get_products_category(self, website, limit, context):
        search_domain = context.get('search_domain')
        domain = [('website_published', '=', True)] + website.website_domain() + (search_domain or [])
        return self.env['product.product'].search(domain, limit=limit)

    def _get_products_recently_viewed(self, website, limit, context):
        products = []
        visitor = self.env['website.visitor']._get_visitor_from_request()
        if visitor:
            excluded_products = website.sale_get_order().mapped('order_line.product_id.id')
            tracked_products = self.env['website.track'].sudo().read_group(
                [('visitor_id', '=', visitor.id), ('product_id', '!=', False), ('product_id.website_published', '=', True), ('product_id', 'not in', excluded_products)],
                ['product_id', 'visit_datetime:max'], ['product_id'], limit=limit, orderby='visit_datetime DESC')
            products_ids = [product['product_id'][0] for product in tracked_products]
            if products_ids:
                products = self.env['product.product'].with_context(display_default_code=False).browse(products_ids[:limit])
        return products

    def _get_products_recently_sold_with(self, website, limit, context):
        products = []
        current_product_id = context.get('product_id')
        if current_product_id:
            current_product_id = int(current_product_id)
            sale_orders = self.env['sale.order'].sudo().search([
                ('state', 'in', ('sale', 'done')), ('order_line.product_id', '=', current_product_id)
            ], limit=8, order='date_order DESC')
            if sale_orders:
                excluded_products = website.sale_get_order().mapped('order_line.product_id.id')
                excluded_products.append(current_product_id)
                included_products = []
                for sale_order in sale_orders:
                    included_products.extend(sale_order.order_line.product_id.mapped('id'))
                products_ids = list(set(included_products) - set(excluded_products))
                if products_ids:
                    products = self.env['product.product'].with_context(display_default_code=False).browse(products_ids[:limit])
        return products

    def _get_products_accessories(self, website, limit, context):
        products = []
        current_product_id = context.get('product_id')
        if current_product_id:
            current_product_id = int(current_product_id)
            current_product = self.env['product.product'].browse(current_product_id)
            if current_product.exists():
                excluded_products = website.sale_get_order().mapped('order_line.product_id.id')
                excluded_products.append(current_product_id)
                included_products = current_product.accessory_product_ids.filtered(
                    lambda product: product.website_published
                ).mapped('id')
                products_ids = list(set(included_products) - set(excluded_products))
                if products_ids:
                    products = self.env['product.product'].with_context(display_default_code=False).browse(products_ids[:limit])
        return products
