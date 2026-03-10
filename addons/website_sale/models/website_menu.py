# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64

from odoo import api, models
from odoo.tools.misc import file_open


class WebsiteMenu(models.Model):
    _inherit = 'website.menu'

    def _compute_visible(self):
        """ Hide '/shop' menus to the public user if only logged-in users can access it. """
        shop_menus = self.filtered(lambda m: m.url[:5] == '/shop')
        for menu in shop_menus:
            menu.is_visible = menu.website_id.has_ecommerce_access()
        return super(WebsiteMenu, self - shop_menus)._compute_visible()

    @api.model
    def _demo_setup_shop_dropdown(self):
        """Demo data helper: transform the default website's plain Shop link
        (created by data.xml) into a rich dropdown with category submenus.

        Called from website_sale/data/demo.xml so that data.xml can keep the
        standard Shop link while demo mode enriches it without any eval-context
        workarounds.
        """
        website = self.env.ref('website.default_website')

        shop = website.menu_id.child_id.filtered(lambda m: m.url == '/shop')[:1]
        if not shop:
            return

        try:
            with file_open('website_sale/static/src/img/products_demo/table02_02.jpg', 'rb') as f:
                shop.write({
                    'image': base64.b64encode(f.read()),
                    'has_image': True,
                })
        except FileNotFoundError:
            pass

        categories = [
            ('Desks',      'website_sale.public_category_desks',      'desks.jpg'),
            ('Furnitures', 'website_sale.public_category_furnitures', 'furnitures.jpg'),
            ('Boxes',      'website_sale.public_category_boxes',      'boxes.jpg'),
            ('Drawers',    'website_sale.public_category_drawers',    'drawers.jpg'),
            ('Cabinets',   'website_sale.public_category_cabinets',   'cabinets.jpg'),
            ('Bins',       'website_sale.public_category_bins',       'bins.jpg'),
            ('Lamps',      'website_sale.public_category_lamps',      'lamps.jpg'),
        ]
        for seq, (name, cat_xmlid, img_file) in enumerate(categories, start=1):
            cat = self.env.ref(cat_xmlid, raise_if_not_found=False)
            if not cat:
                continue
            img_data = False
            try:
                with file_open(
                        f'website_sale/static/src/img/categories/{img_file}', 'rb'
                ) as f:
                    img_data = base64.b64encode(f.read())
            except FileNotFoundError:
                pass
            self.create({
                'name': name,
                'url': f'/shop?category={cat.id}',
                'website_id': website.id,
                'parent_id': shop.id,
                'sequence': seq * 10,
                'image': img_data,
                'has_image': bool(img_data),
            })

        self.create({
            'name': 'All Products',
            'url': '/shop',
            'website_id': website.id,
            'parent_id': shop.id,
            'sequence': 80,
        })