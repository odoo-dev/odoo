from odoo.tests import HttpCase, tagged, users
from odoo.addons.hr.tests.test_utils import get_admin_employee


@tagged('post_install', '-at_install')
class TestTimeOffAccrualDateFilterTour(HttpCase):

    @users('admin')
    def test_time_off_accrual_date_filter_tour(self):
        self.admin_employee = get_admin_employee(self.env)
        self.start_tour('/odoo', 'time_off_accrual_date_filter_tour', login='admin')
