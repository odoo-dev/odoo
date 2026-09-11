
from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestSaleLSE(HttpCase):
    def test_sale_lse(self):
        self.start_tour("/odoo/sales/new", "test_sale_lse_tour", login="admin")
