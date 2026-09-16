# Part of Odoo. See LICENSE file for full copyright and licensing details.
from unittest.mock import patch
from urllib.parse import quote

import odoo.tests
from werkzeug.exceptions import NotFound

from odoo.exceptions import AccessError
from odoo.fields import Command

from odoo.addons.website.controllers.main import Website

PREVIEW_PATH = '/theme_test/static/description/preview.html'
PREVIEW_HTML = '<!DOCTYPE html><html><head></head><body><h1>Preview</h1></body></html>'


@odoo.tests.tagged('post_install', '-at_install')
class TestConfiguratorPreview(odoo.tests.HttpCase):

    def setUp(self):
        super().setUp()
        self.controller = Website()
        self.restricted_user = self.env['res.users'].create({
            'name': 'Restricted Editor',
            'login': 'test_configurator_preview',
            'password': 'test_configurator_preview',
            'group_ids': [Command.set([
                self.ref('base.group_user'),
                self.ref('website.group_website_restricted_editor'),
            ])],
        })

    def _mock_preview_html(self):
        """ Community has no theme shipping a static preview: fake one. """
        return (
            patch.object(Website, '_get_configurator_preview_path', lambda self, theme_name: PREVIEW_PATH),
            patch.object(Website, '_load_configurator_preview_html', lambda self, preview_url: PREVIEW_HTML),
        )

    def test_preview_html_is_only_loaded_from_theme_previews(self):
        """ The preview path must not allow reading any addon file. """
        for preview_url in (
            '/website/models/website.py',
            '/website/__manifest__.py',
            '/website/static/description/preview.html.py',
        ):
            with self.subTest(preview_url=preview_url), self.assertRaises(NotFound):
                self.controller._load_configurator_preview_html(preview_url)

    def test_preview_palette_is_sanitized(self):
        """ Palette colors are injected in a stylesheet: only colors pass. """
        self.assertEqual(
            self.controller._get_configurator_preview_palette([
                '#017E84',
                '#FFF',
                'rgb(1, 2, 3)',
                'red}</style><script>alert(1)</script><style>',
                'var(--o-color-1)',
            ]),
            ['#017E84', '#FFF', 'rgb(1, 2, 3)', '', ''],
        )

    def test_preview_route_rejects_an_unknown_theme(self):
        self.authenticate('admin', 'admin')
        for theme_name in ('', 'website', '../website', 'theme_does_not_exist'):
            with self.subTest(theme_name=theme_name):
                res = self.url_open(f'/website/configurator/preview?theme_name={quote(theme_name)}')
                self.assertEqual(res.status_code, 404)

    def test_preview_route_is_restricted_to_designers(self):
        path_patch, html_patch = self._mock_preview_html()
        with path_patch, html_patch:
            self.authenticate('admin', 'admin')
            res = self.url_open('/website/configurator/preview?theme_name=theme_test&color1=%23017E84')
            self.assertEqual(res.status_code, 200)
            self.assertIn('--o-color-1: #017E84;', res.text)
            self.assertIn("default-src 'none'", res.headers['Content-Security-Policy'])

            self.authenticate('test_configurator_preview', 'test_configurator_preview')
            res = self.url_open('/website/configurator/preview?theme_name=theme_test')
            self.assertEqual(res.status_code, 404)

    def test_preview_route_does_not_inject_arbitrary_css(self):
        path_patch, html_patch = self._mock_preview_html()
        with path_patch, html_patch:
            self.authenticate('admin', 'admin')
            payload = quote('red}</style><script>alert(1)</script><style>')
            res = self.url_open(f'/website/configurator/preview?theme_name=theme_test&color1={payload}')
            self.assertEqual(res.status_code, 200)
            self.assertNotIn('<script>', res.text)

    def test_configurator_methods_require_a_designer(self):
        """ Those methods do not touch any record, hence no ACL applies. """
        website = self.env['website'].with_user(self.restricted_user)
        with self.assertRaises(AccessError):
            website.configurator_init()
        with self.assertRaises(AccessError):
            website.configurator_recommended_themes(industry_id=1)
        with self.assertRaises(AccessError):
            website.configurator_get_images(1)
        with self.assertRaises(AccessError):
            website.configurator_missing_industry('unknown industry')
        with self.assertRaises(AccessError):
            website.configurator_skip()
        with self.assertRaises(AccessError):
            website.configurator_apply(theme_name='theme_default')
