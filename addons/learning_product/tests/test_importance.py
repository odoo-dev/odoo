from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon


@tagged('post_install', '-at_install')
class TestProductImportance(BaseCommon):

    def test_product_template_profile(self):
        profile = self.env['learning.importance'].get_focus_profile('product.template')
        for field_name in ('name', 'categ_id', 'type', 'sale_ok', 'list_price'):
            self.assertIn(field_name, profile)
        for field_name in ('is_favorite', 'active', 'company_id', 'product_properties'):
            self.assertNotIn(field_name, profile)
        # searched and grouped by beats only shown in the list
        self.assertGreater(profile['categ_id'], profile['list_price'])
