from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestMonthSelectionForFebruaryTour(HttpCase):

    def test_month_selection_for_february_tour(self):
        self.start_tour("/odoo", "month_selection_for_february_tour", login="admin")
