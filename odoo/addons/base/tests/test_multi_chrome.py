from odoo.tests import tagged, HttpCase

@tagged('post_install', '-at_install')
class TestMultiChrome(HttpCase):

    def test_multi_chrome(self):
        for i in range(10000):
            with self.subTest(i=i):
                msg = f"Running test {i}"
                self.browser_js(url_path='about:blank', code=f'console.log("{msg}");', success_signal=msg)
