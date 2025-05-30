from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestSaleOrderCards(HttpCase):
    def test_sale_order_cards_snippet(self):
        self.start_tour(
            self.env["website"].get_client_action_url("/"),
            "snippet_sale_order_cards",
            login="admin",
        )
