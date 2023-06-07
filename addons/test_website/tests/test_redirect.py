# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import odoo
from odoo.tests import HttpCase, tagged
from odoo.tools import mute_logger
from odoo.addons.http_routing.models.ir_http import slug
from odoo.addons.website.tools import MockRequest

from unittest.mock import patch
from urllib.parse import urlparse


@tagged('-at_install', 'post_install')
class TestRedirect(HttpCase):

    def setUp(self):
        super(TestRedirect, self).setUp()

        self.user_portal = self.env['res.users'].with_context({'no_reset_password': True}).create({
            'name': 'Test Website Portal User',
            'login': 'portal_user',
            'password': 'portal_user',
            'email': 'portal_user@mail.com',
            'groups_id': [(6, 0, [self.env.ref('base.group_portal').id])]
        })

    def test_01_redirect_308_model_converter(self):

        self.env['website.rewrite'].create({
            'name': 'Test Website Redirect',
            'redirect_type': '308',
            'url_from': '/test_website/country/<model("res.country"):country>',
            'url_to': '/redirected/country/<model("res.country"):country>',
        })
        country_ad = self.env.ref('base.ad')

        """ Ensure 308 redirect with model converter works fine, including:
                - Correct & working redirect as public user
                - Correct & working redirect as logged in user
                - Correct replace of url_for() URLs in DOM
        """
        url = '/test_website/country/' + slug(country_ad)
        redirect_url = url.replace('test_website', 'redirected')

        # [Public User] Open the original url and check redirect OK
        r = self.url_open(url)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.url.endswith(redirect_url), "Ensure URL got redirected")
        self.assertTrue(country_ad.name in r.text, "Ensure the controller returned the expected value")
        self.assertTrue(redirect_url in r.text, "Ensure the url_for has replaced the href URL in the DOM")

        # [Logged In User] Open the original url and check redirect OK
        self.authenticate("portal_user", "portal_user")
        r = self.url_open(url)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.url.endswith(redirect_url), "Ensure URL got redirected (2)")
        self.assertTrue('Logged In' in r.text, "Ensure logged in")
        self.assertTrue(country_ad.name in r.text, "Ensure the controller returned the expected value (2)")
        self.assertTrue(redirect_url in r.text, "Ensure the url_for has replaced the href URL in the DOM")

    @mute_logger('odoo.http')  # mute 403 warning
    def test_02_redirect_308_RequestUID(self):
        self.env['website.rewrite'].create({
            'name': 'Test Website Redirect',
            'redirect_type': '308',
            'url_from': '/test_website/200/<model("test.model"):rec>',
            'url_to': '/test_website/308/<model("test.model"):rec>',
        })

        rec_published = self.env['test.model'].create({'name': 'name', 'website_published': True})
        rec_unpublished = self.env['test.model'].create({'name': 'name', 'website_published': False})

        WebsiteHttp = odoo.addons.website.models.ir_http.Http

        def _get_error_html(env, code, value):
            return str(code).split('_')[-1], f"CUSTOM {code}"

        with patch.object(WebsiteHttp, '_get_error_html', _get_error_html):
            # Patch will avoid to display real 404 page and regenerate assets each time and unlink old one.
            # And it allow to be sur that exception id handled by handle_exception and return a "managed error" page.

            # published
            resp = self.url_open(f"/test_website/200/name-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(urlparse(resp.headers.get('Location', '')).path, f"/test_website/308/name-{rec_published.id}")

            resp = self.url_open(f"/test_website/308/name-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 200)

            resp = self.url_open(f"/test_website/200/xx-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/xx-{rec_published.id}")

            resp = self.url_open(f"/test_website/308/xx-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 301)
            self.assertEqual(urlparse(resp.headers.get('Location'), '').path, f"/test_website/308/name-{rec_published.id}")

            resp = self.url_open(f"/test_website/200/xx-{rec_published.id}", allow_redirects=True)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.url, f"{self.base_url()}/test_website/308/name-{rec_published.id}")

            # unexisting
            resp = self.url_open("/test_website/200/name-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/name-100")

            resp = self.url_open("/test_website/308/name-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 404)
            self.assertEqual(resp.text, "CUSTOM 404")

            resp = self.url_open("/test_website/200/xx-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/xx-100")

            resp = self.url_open("/test_website/308/xx-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 404)
            self.assertEqual(resp.text, "CUSTOM 404")

            # unpublish
            resp = self.url_open(f"/test_website/200/name-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/name-{rec_unpublished.id}")

            resp = self.url_open(f"/test_website/308/name-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.text, "CUSTOM 403")

            resp = self.url_open(f"/test_website/200/xx-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/xx-{rec_unpublished.id}")

            resp = self.url_open(f"/test_website/308/xx-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.text, "CUSTOM 403")

            # with seo_name as slug
            rec_published.seo_name = "seo_name"
            rec_unpublished.seo_name = "seo_name"

            resp = self.url_open(f"/test_website/200/seo-name-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/seo-name-{rec_published.id}")

            resp = self.url_open(f"/test_website/308/seo-name-{rec_published.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 200)

            resp = self.url_open(f"/test_website/200/xx-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/xx-{rec_unpublished.id}")

            resp = self.url_open(f"/test_website/308/xx-{rec_unpublished.id}", allow_redirects=False)
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.text, "CUSTOM 403")

            resp = self.url_open("/test_website/200/xx-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 308)
            self.assertEqual(resp.headers.get('Location'), f"{self.base_url()}/test_website/308/xx-100")

            resp = self.url_open("/test_website/308/xx-100", allow_redirects=False)
            self.assertEqual(resp.status_code, 404)
            self.assertEqual(resp.text, "CUSTOM 404")

    def test_03_redirect_308_qs(self):
        self.env['website.rewrite'].create({
            'name': 'Test QS Redirect',
            'redirect_type': '308',
            'url_from': '/empty_controller_test',
            'url_to': '/empty_controller_test_redirected',
        })
        r = self.url_open('/test_website/test_redirect_view_qs?a=a')
        self.assertEqual(r.status_code, 200)
        self.assertIn(
            'href="/empty_controller_test_redirected?a=a"', r.text,
            "Redirection should have been applied, and query string should not have been duplicated.",
        )

    @mute_logger('odoo.http')  # mute 403 warning
    def test_04_redirect_301_route_unpublished_record(self):
        # 1. Accessing published record: Normal case, expecting 200
        rec1 = self.env['test.model'].create({
            'name': '301 test record',
            'is_published': True,
        })
        url_rec1 = '/test_website/200/' + slug(rec1)
        r = self.url_open(url_rec1)
        self.assertEqual(r.status_code, 200)

        # 2. Accessing unpublished record: expecting 403 by default
        rec1.is_published = False
        r = self.url_open(url_rec1)
        self.assertEqual(r.status_code, 403)

        # 3. Accessing unpublished record with redirect to a 404: expecting 404
        redirect = self.env['website.rewrite'].create({
            'name': 'Test 301 Redirect route unpublished record',
            'redirect_type': '301',
            'url_from': url_rec1,
            'url_to': '/404',
        })
        r = self.url_open(url_rec1)
        self.assertEqual(r.status_code, 404)

        # 4. Accessing unpublished record with redirect to another published
        # record: expecting redirect to that record
        rec2 = rec1.copy({'is_published': True})
        url_rec2 = '/test_website/200/' + slug(rec2)
        redirect.url_to = url_rec2
        r = self.url_open(url_rec1)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(
            r.url.endswith(url_rec2),
            "Unpublished record should redirect to published record set in redirect")

    @mute_logger('odoo.http')
    def test_05_redirect_404_notfound_record(self):
        # 1. Accessing unexisting record: raise 404
        url_rec1 = '/test_website/200/unexisting-100000'
        r = self.url_open(url_rec1)
        self.assertEqual(r.status_code, 404)

        # 2. Accessing unpublished record with redirect to a 404: expecting 404
        redirect = self.env['website.rewrite'].create({
            'name': 'Test 301 Redirect route unexisting record',
            'redirect_type': '301',
            'url_from': url_rec1,
            'url_to': '/get',
        })
        r = self.url_open(url_rec1, allow_redirects=False)
        self.assertEqual(r.status_code, 301)
        self.assertTrue(r.headers.get('Location', '').endswith(redirect.url_to))

        r = self.url_open(url_rec1, allow_redirects=True)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.url.endswith(redirect.url_to))

    def test_redirect_308_multiple_url_endpoint(self):
        self.env['website.rewrite'].create({
            'name': 'Test Multi URL 308',
            'redirect_type': '308',
            'url_from': '/test_countries_308',
            'url_to': '/test_countries_308_redirected',
        })
        rec1 = self.env['test.model'].create({
            'name': '301 test record',
            'is_published': True,
        })
        url_rec1 = f"/test_countries_308/{slug(rec1)}"

        resp = self.url_open("/test_countries_308", allow_redirects=False)
        self.assertEqual(resp.status_code, 308)
        self.assertEqual(resp.headers.get('Location'), self.base_url() + "/test_countries_308_redirected")

        resp = self.url_open(url_rec1)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.url.endswith(url_rec1))


@tagged('-at_install', 'post_install')
class TestRedirectPortal(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_admin = cls.env.ref('base.user_admin')
        cls.customer = cls.env['res.partner'].create({
            'country_id': cls.env.ref('base.fr').id,
            'email': 'mdelvaux34@example.com',
            'lang': 'en_US',
            'mobile': '+33639982325',
            'name': 'Mathias Delvaux',
            'phone': '+33353011823',
        })
        cls.record_portal = cls.env['website.mail.test.portal'].create({
            'name': 'Test Portal Record',
            'partner_id': cls.customer.id,
            'user_id': cls.user_admin.id,
        })
        for group_name, group_func, group_data in cls.record_portal.sudo()._notify_get_recipients_groups(
            cls.env['mail.message'], False
        ):
            if group_name == 'portal_customer' and group_func(cls.customer):
                cls.record_access_url = group_data['button_access']['url']
                break
        else:
            raise AssertionError('Record access URL not found')
        cls.website = cls.env.ref('website.default_website')

    @mute_logger('odoo.addons.base.models.ir_model')
    def test_customer_access_not_logged_language_redirection(self):
        """Check that the customer is redirected to a page in his language."""
        self._setup_website_customer_lang('en_US')
        res = self.url_open(self.record_access_url)
        self.assertNotIn(f'/en/my/website_test_portal/{self.record_portal.id}', res.url)
        self.assertIn(f'/my/website_test_portal/{self.record_portal.id}', res.url)

        for lang_code, expected_url_prefix in (('fr_FR', '/fr'), ('es_ES', '/es')):
            lang = self._setup_website_customer_lang(lang_code)
            # Language not enabled in the current website: no redirection to customer language to avoid 404
            self.website.language_ids -= lang
            res = self.url_open(self.record_access_url)
            self.assertNotIn(f'{expected_url_prefix}/my/website_test_portal/{self.record_portal.id}', res.url)
            self.assertIn(f'/my/website_test_portal/{self.record_portal.id}', res.url)
            # Language enabled in the current website: redirection to customer language
            self.website.language_ids += lang
            res = self.url_open(self.record_access_url)
            self.assertIn(f'{expected_url_prefix}/my/website_test_portal/{self.record_portal.id}', res.url)

    @mute_logger('odoo.addons.base.models.ir_model')
    def test_profile_language_redirection(self):
        """ Profile the portal redirection to a customer language page for which
        the language is enabled in the website (and not the default one).

        This is the standard case with 2 queries added for adding the language
        in the URL during the redirection and 3 more added while processing the
        URL with the prefixed language (compared to not adding it).
        """
        self._setup_website_customer_lang('es_ES')
        self._preload_res_lang_get_available()
        with self.assertQueryCount(29):
            self.url_open(self.record_access_url)

    @mute_logger('odoo.addons.base.models.ir_model')
    def test_profile_language_redirection_default(self):
        """ Profile the portal redirection to a customer language page for which
        the language is the default website language.

        There are more queries than in test_profile_language_redirection because the
        customer language is first added and then removed during the redirection.
        """
        self._setup_website_customer_lang('en_US')
        self._preload_res_lang_get_available()
        with self.assertQueryCount(31):
            self.url_open(self.record_access_url)

    @mute_logger('odoo.addons.base.models.ir_model')
    def test_profile_language_redirection_disabled_language(self):
        """ Profile the portal redirection to a customer language page for which the
        language is not enabled in the website (redirected to the default language page).

        There are fewer queries than in test_profile_language_redirection because the
        customer language is never added in the URL as it is not enabled.
        """
        lang = self._setup_website_customer_lang('es_ES')
        self.website.language_ids -= lang
        self._preload_res_lang_get_available()
        with self.assertQueryCount(26):
            self.url_open(self.record_access_url)

    def _preload_res_lang_get_available(self):
        """ Preload get_available language for default website and no website
        (see url_lang called by url_for).

        As res_lang.get_available method is cached, we use this method before measuring the
        number of queries to avoid to count queries that will be cached most of the time.
        """
        with MockRequest(self.env, website=self.website) as request:
            request.is_front_end = True
            request.env['res.lang'].with_context(website_id=self.website.id).sudo().get_available()
            request.env['res.lang'].sudo().get_available()

    def _setup_website_customer_lang(self, lang_code):
        """ Activate language for the website and set it to the customer. """
        ResLang = self.env['res.lang']
        lang = ResLang._activate_lang(lang_code) or ResLang._create_lang(lang_code)
        self.website.language_ids += lang
        self.customer.lang = lang_code
        return lang
