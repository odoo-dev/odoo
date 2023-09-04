# Part of Odoo. See LICENSE file for full copyright and licensing details.

import html
import json
from odoo.tests import tagged
from odoo.tests.common import new_test_user
from odoo.tools import mute_logger, submap
from odoo.addons.test_http.utils import HtmlTokenizer
from odoo.addons.test_http.controllers import CT_JSON

from .test_common import TestHttpBase


@tagged('post_install', '-at_install')
class TestHttpModels(TestHttpBase):
    def setUp(self):
        super().setUp()
        self.jackoneill = new_test_user(self.env, 'jackoneill', context={'lang': 'en_US'})
        self.authenticate('jackoneill', 'jackoneill')

    def test_models0_galaxy_ok(self):
        milky_way = self.env.ref('test_http.milky_way')

        res = self.url_open(f"/test_http/{milky_way.id}")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            HtmlTokenizer.tokenize(res.text),
            HtmlTokenizer.tokenize('''\
                <p>Milky Way</p>
                <ul>
                    <li><a href="/test_http/1/1">Earth (P4X-126)</a></li>
                    <li><a href="/test_http/1/2">Abydos (P2X-125)</a></li>
                    <li><a href="/test_http/1/3">Dakara (P5C-113)</a></li>
                </ul>
                ''')
            )

    @mute_logger('odoo.http')
    def test_models1_galaxy_ko(self):
        res = self.url_open("/test_http/404")  # unknown galaxy
        self.assertEqual(res.status_code, 400)
        self.assertIn('The Ancients did not settle there.', res.text)

    def test_models2_stargate_ok(self):
        milky_way = self.env.ref('test_http.milky_way')
        earth = self.env.ref('test_http.earth')

        res = self.url_open(f'/test_http/{milky_way.id}/{earth.id}')

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            HtmlTokenizer.tokenize(res.text),
            HtmlTokenizer.tokenize('''\
                <dl>
                    <dt>name</dt><dd>Earth</dd>
                    <dt>address</dt><dd>sq5Abt</dd>
                    <dt>sgc_designation</dt><dd>P4X-126</dd>
                </dl>
            ''')
        )

    @mute_logger('odoo.http')
    def test_models3_stargate_ko(self):
        milky_way = self.env.ref('test_http.milky_way')
        res = self.url_open(f'/test_http/{milky_way.id}/9999')  # unknown gate
        self.assertEqual(res.status_code, 400)
        self.assertIn("The goa'uld destroyed the gate", html.unescape(res.text))

    @mute_logger('odoo.http', 'odoo.sql_db')
    def test_models4_integer_overflow(self):
        max_int = 2_147_483_647

        payload = {
            'id': 0,
            'jsonrpc': '2.0',
            'method': 'call',
            'params': {
                'model': 'res.users',
                'method': 'write',
                'args': [
                    [self.jackoneill.id],
                    {
                        'color': max_int + 1,
                    }
                ],
                'kwargs': {},
            },
        }

        self.authenticate('admin', 'admin')
        res = self.url_open('/web/dataset/call_kw', json.dumps(payload), headers=CT_JSON)
        res.raise_for_status()
        self.assertEqual(
            submap(res.json()['error']['data'], ('name', 'message')),
            {
                'name': 'odoo.exceptions.ValidationError',
                'message': "The operation cannot be completed: a numeric value is out of range.\n\n"
            }
        )
