# coding: utf-8
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo.addons.base.tests.common import HttpCaseWithUserDemo
from odoo.addons.website.tools import MockRequest
from odoo.tests import tagged


@tagged('-at_install', 'post_install', 'website_visitor')
class WebsiteVisitorTests(HttpCaseWithUserDemo):

    def setUp(self):
        super(WebsiteVisitorTests, self).setUp()

        self.website = self.env['website'].search([
            ('company_id', '=', self.env.user.company_id.id)
        ], limit=1)
        self.cookies = {}

        untracked_view = self.env['ir.ui.view'].create({
            'name': 'UrtackedView',
            'type': 'qweb',
            'arch': '''<t name="Homepage" t-name="website.base_view">
                        <t t-call="website.layout">
                            I am a generic page
                        </t>
                    </t>''',
            'key': 'test.base_view',
            'track': False,
        })
        tracked_view = self.env['ir.ui.view'].create({
            'name': 'TrackedView',
            'type': 'qweb',
            'arch': '''<t name="Homepage" t-name="website.base_view">
                        <t t-call="website.layout">
                            I am a generic page
                        </t>
                    </t>''',
            'key': 'test.base_view',
            'track': True,
        })
        tracked_view_2 = self.env['ir.ui.view'].create({
            'name': 'TrackedView2',
            'type': 'qweb',
            'arch': '''<t name="OtherPage" t-name="website.base_view">
                        <t t-call="website.layout">
                            I am a generic second page
                        </t>
                    </t>''',
            'key': 'test.base_view',
            'track': True,
        })
        [self.untracked_page, self.tracked_page, self.tracked_page_2] = self.env['website.page'].create([
            {
                'view_id': untracked_view.id,
                'url': '/untracked_view',
                'website_published': True,
            },
            {
                'view_id': tracked_view.id,
                'url': '/tracked_view',
                'website_published': True,
            },
            {
                'view_id': tracked_view_2.id,
                'url': '/tracked_view_2',
                'website_published': True,
            },
        ])

        self.user_portal = self.env['res.users'].search([('login', '=', 'portal')])
        self.partner_portal = self.user_portal.partner_id
        if not self.user_portal:
            self.env['ir.config_parameter'].sudo().set_param('auth_password_policy.minlength', 4)
            self.partner_portal = self.env['res.partner'].create({
                'name': 'Joel Willis',
                'email': 'joel.willis63@example.com',
            })
            self.user_portal = self.env['res.users'].create({
                'login': 'portal',
                'password': 'portal',
                'partner_id': self.partner_portal.id,
                'groups_id': [(6, 0, [self.env.ref('base.group_portal').id])],
            })

    def test_create_visitor_on_tracked_page(self):
        existing_visitors = self.env['website.visitor'].search([])
        existing_tracks = self.env['website.track'].search([])
        self.url_open(self.untracked_page.url)
        self.url_open(self.tracked_page.url)
        self.url_open(self.tracked_page.url)

        new_visitor = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        new_track = self.env['website.track'].search([('id', 'not in', existing_tracks.ids)])
        self.assertEqual(len(new_visitor), 1, "1 visitor should be created")
        self.assertEqual(len(new_track), 1, "There should be 1 tracked page")
        self.assertEqual(new_visitor.visit_count, 1)
        self.assertEqual(new_visitor.website_track_ids, new_track)
        self.assertEqual(new_visitor.website_track_ids.page_id.name, 'TrackedView')

        # admin connects
        self.cookies = {'visitor_uuid': new_visitor.access_token}
        with MockRequest(self.env, website=self.website, cookies=self.cookies):
            self.authenticate(self.user_admin.login, 'admin')
        # visit a page
        self.url_open(self.tracked_page_2.url)

        # page is tracked
        self.assertEqual(len(new_visitor.website_track_ids), 2, "There should be 2 tracked pages for the admin")
        # visitor is linked
        self.assertEqual(new_visitor.partner_id, self.partner_admin, "self.Visitor should be linked with connected partner")

        # portal user connects
        with MockRequest(self.env, website=self.website, cookies=self.cookies):
            self.authenticate(self.user_portal.login, 'portal')
            self.assertEqual(len(self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])), 1, "No extra visitor should be created")
        # visit a page
        self.url_open(self.tracked_page.url)
        self.url_open(self.untracked_page.url)
        self.url_open(self.tracked_page_2.url)
        self.url_open(self.tracked_page_2.url)  # 2 time to be sure it does not record twice

        # new visitor is created
        new_visitors = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        self.assertEqual(len(new_visitors), 2, "One extra visitor should be created")
        visitor_portal = new_visitors[0]
        self.cookies['visitor_uuid'] = visitor_portal.access_token
        # visitor is linked
        self.assertEqual(visitor_portal.partner_id, self.env['res.users'].browse(self.session.uid).partner_id, "self.Visitor should be linked with connected partner")
        # tracks are created
        self.assertEqual(len(visitor_portal.website_track_ids), 2, "There should be 2 tracked pages for the portal user")

        # portal user disconnects
        self.logout()

        # visit some pages
        self.url_open(self.tracked_page.url)
        self.url_open(self.untracked_page.url)
        self.url_open(self.tracked_page_2.url)
        self.url_open(self.tracked_page_2.url)  # 2 time to be sure it does not record twice

        # new visitor is created
        new_visitors = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        self.assertEqual(len(new_visitors), 3, "One extra visitor should be created")
        visitor = new_visitors[0]
        self.cookies['visitor_uuid'] = visitor.access_token
        # tracks are created
        self.assertEqual(len(visitor.website_track_ids), 2, "There should be 2 tracked page for the visitor")
        # visitor is not linked
        self.assertFalse(visitor.partner_id, "self.Visitor should not be linked to any partner")

        # admin connects
        with MockRequest(self.env, website=self.website, cookies=self.cookies):
            self.authenticate(self.user_admin.login, 'admin')

        # one visitor is deleted
        new_visitors = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        self.assertEqual(len(new_visitors), 2, "One visitor should be deleted")
        visitor_admin = self.env['website.visitor'].search([('partner_id', '=', self.partner_admin.id)])
        # tracks are linked
        self.assertEqual(len(visitor_admin.website_track_ids), 4, "There should be 4 tracked page for the admin")

        # admin user disconnects
        self.logout()

        # visit some pages
        self.url_open(self.tracked_page.url)
        self.url_open(self.untracked_page.url)
        self.url_open(self.tracked_page_2.url)
        self.url_open(self.tracked_page_2.url)  # 2 time to be sure it does not record twice

        # new visitor created
        new_visitors = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        self.assertEqual(len(new_visitors), 3, "One extra visitor should be created")
        visitor = new_visitors[0]
        self.cookies['visitor_uuid'] = visitor.access_token
        # tracks are created
        self.assertEqual(len(visitor.website_track_ids), 2, "There should be 2 tracked page for the visitor")
        # visitor is not linked
        self.assertFalse(visitor.partner_id, "self.Visitor should not be linked to any partner")

        # portal user connects
        with MockRequest(self.env, website=self.website, cookies=self.cookies):
            self.authenticate(self.user_portal.login, 'portal')

        # one visitor is deleted
        new_visitors = self.env['website.visitor'].search([('id', 'not in', existing_visitors.ids)])
        self.assertEqual(len(new_visitors), 2, "One visitor should be deleted")
        visitor_portal = self.env['website.visitor'].search([('partner_id', '=', self.partner_portal.id)])
        # tracks are linked
        self.assertEqual(len(visitor_portal.website_track_ids), 4, "There should be 4 tracked page for the portal user")

        # simulate the portal user comes back 30min later
        for track in visitor_portal.website_track_ids:
            track.write({'visit_datetime': track.visit_datetime - timedelta(minutes=30)})

        # visit a page
        self.url_open(self.tracked_page.url)
        # tracks are created
        self.assertEqual(len(visitor_portal.website_track_ids), 5, "There should be 5 tracked page for the portal user")

        # simulate the portal user comes back 8hours later
        visitor_portal.write({'last_connection_datetime': visitor_portal.last_connection_datetime - timedelta(hours=8)})
        self.url_open(self.tracked_page.url)
        # check number of visits
        self.assertEqual(visitor_portal.visit_count, 2, "There should be 2 visits for the portal user")

    def test_long_period_inactivity(self):
        self.env['ir.config_parameter'].sudo().set_param('website.visitor.live.days', 7)

        # link visitor to partner
        old_visitor = self.env['website.visitor'].create({
            'lang_id': self.env.ref('base.lang_en').id,
            'country_id': self.env.ref('base.be').id,
            'website_id': 1,
        })
        partner_demo = self.env.ref('base.partner_demo')
        old_visitor.partner_id = partner_demo.id
        self.assertEqual(partner_demo.visitor_ids.id, old_visitor.id, "The partner visitor should be set correctly.")

        # archive old visitor
        old_visitor.last_connection_datetime = datetime.now() - timedelta(days=8)
        self.env['website.visitor']._cron_archive_visitors()
        self.assertEqual(old_visitor.active, False, "The visitor should be archived after one week of inactivity")

        # reconnect with new visitor.
        self.url_open(self.tracked_page.url)
        new_visitor = self.env['website.visitor'].search([('id', '!=', old_visitor.id)], limit=1, order="id desc") # get the last created visitor
        new_visitor_id = new_visitor.id
        self.assertEqual(new_visitor_id > old_visitor.id, True, "A new visitor should have been created.")
        self.assertEqual(len(new_visitor), 1, "A visitor should be created after visiting a tracked view")
        self.assertEqual(len(self.env['website.track'].search([('visitor_id', '=', new_visitor.id)])), 1,
                         "A track for the new visitor should be created after visiting a tracked view")

        # override the get_visitor_from_request to mock that is new_visitor that authenticates
        def get_visitor_from_request(self_mock, force_create=False):
            return new_visitor
        self.patch(type(self.env['website.visitor']), '_get_visitor_from_request', get_visitor_from_request)

        self.authenticate('demo', 'demo')
        self.assertEqual(partner_demo.visitor_ids.id, old_visitor.id, "The partner visitor should be back to the 'old' visitor.")

        new_visitor = self.env['website.visitor'].search([('id', '=', new_visitor_id)])
        self.assertEqual(len(new_visitor), 0, "The new visitor should be deleted when visitor authenticate once again.")
        self.assertEqual(old_visitor.active, True, "The old visitor should be reactivated when visitor authenticates once again.")
