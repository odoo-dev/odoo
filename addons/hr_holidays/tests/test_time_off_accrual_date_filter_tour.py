from odoo.tests import HttpCase, tagged, users


@tagged('post_install', '-at_install')
class TestTimeOffAccrualDateFilterTour(HttpCase):

    @users('admin')
    def test_time_off_accrual_date_filter_tour(self):
        self.start_tour('/odoo', 'time_off_accrual_date_filter_tour', login='admin')
