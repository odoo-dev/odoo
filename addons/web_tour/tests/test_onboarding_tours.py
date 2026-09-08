# Part of Odoo. See LICENSE file for full copyright and licensing details.

import contextlib

from requests import Session, PreparedRequest, Response

from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestOnboardingTours(HttpCase):

    tour_names = [
        'event_tour', 'discuss_channel_tour',
        'sale_tour', 'purchase_tour', 'mass_mailing_tour',
        'frontdesk_tour', 'hr_expense_extract_tour', 'appointment_tour',
        'sale_subscription_tour', 'project_tour', 'helpdesk_tour',
        'rental_tour', 'web_studio_new_app_tour', 'question_tour',
        'crm_tour', 'account_tour', 'point_of_sale_tour',
        'website_sale.onboarding_tour', 'blog', 'documents_tour',
    ]

    @classmethod
    def _request_handler(cls, s: Session, r: PreparedRequest, /, **kw):
        # account_tour opens the accounting dashboard, which fetches bank institutions from odoofin
        if 'proxy/v2/get_dashboard_institutions' in r.url:
            r = Response()
            r.status_code = 200
            r.json = list
            return r
        return super()._request_handler(s, r, **kw)

    def setUp(self):
        super().setUp()
        # Company and admin emails are always set on a configured instance
        self.env.ref('base.main_company').email = 'company@example.com'
        self.env.ref('base.user_admin').email = 'admin@example.com'

    def _get_tours(self, exclude=()):
        names = [n for n in self.tour_names if n not in exclude]
        tours = self.env['web_tour.tour'].search([('name', 'in', names)])
        if not tours:
            # web_tour only depends on web: the modules defining these onboarding
            # tours (e.g. hr_expense, event) may not be installed in every build.
            self.skipTest("None of the onboarding tours were found: are the modules that define them installed?")
        return tours

    # Tours whose JS is only bundled inside the website builder's "preview" client
    # action, not on the plain frontend page their `url` field points to.
    _website_preview_tour_names = {'website_sale.onboarding_tour', 'blog'}

    def test_onboarding_tours(self):
        for tour in self._get_tours():
            with self.subTest(tour_name=tour.name), contextlib.closing(self.env.cr.savepoint()):
                code = f"odoo.startTour({tour.name!r}, {{'mode': 'manual', 'robot': true}})"
                if tour.name in self._website_preview_tour_names:
                    url = self.env['website'].get_client_action_url(tour.url)
                else:
                    url = tour.url or '/odoo'
                self.start_tour(url, tour.name, code=code, login="admin")
