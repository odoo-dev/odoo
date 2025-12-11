# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.test_http.tests.test_static import TestHttpStaticCommon
from odoo.addons.website.tests.test_performance import UtilPerf


class TestPerformance(UtilPerf):
    def test_10_perf_sql_website_controller_minimalist(self):
        url = '/empty_controller_test'
        select_tables_perf = {
            'orm_signaling_registry': 1,
        }
        self._check_url_hot_query(url, 1, select_tables_perf)


class TestImagePerformance(TestHttpStaticCommon):
    def test_01_web_image_performance(self):
        self.assertDownloadPlaceholder('/web/image/no.xmlid')

        with self.subTest(name="existing xmlid"), self.assertQueryCount(2):
            self.assertDownloadPlaceholder('/web/image/web.image_placeholder')

        with self.subTest(name="non existing xmlid"), self.assertQueryCount(4):
            self.assertDownloadPlaceholder('/web/image/no.xmlid_2')

        with self.subTest(name="non existing id"), self.assertQueryCount(6):
            self.assertDownloadPlaceholder('/web/image/99999')
