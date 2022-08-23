# Part of Odoo. See LICENSE file for full copyright and licensing details.
from socket import gethostbyname
from unittest.mock import patch
from urllib.parse import urlparse

import odoo
from odoo.http import root
from odoo.tests import tagged
from odoo.tests.common import HOST, WsgiCase, HttpCase
from odoo.tools import config, file_path
from .test_common import HttpTestMixin, nodb, multidb


class MiscMixin(HttpTestMixin):
    @nodb()
    def test_misc0_redirect(self):
        res = self.opener.get('/test_http//greeting', allow_redirects=False)
        self.assertEqual(res.status_code, 301)
        self.assertEqual(urlparse(res.headers.get('Location', '')).path, '/test_http/greeting')

    @nodb()
    def test_misc1_reverse_proxy(self):
        # client <-> reverse-proxy <-> odoo
        client_ip = '127.0.0.16'
        reverseproxy_ip = gethostbyname(HOST)
        host = 'mycompany.odoo.com'

        headers = {
            'Host': '',
            'X-Forwarded-For': client_ip,
            'X-Forwarded-Host': host,
            'X-Forwarded-Proto': 'https',
        }

        # Don't trust client-sent forwarded headers
        with patch.object(config, 'options', {**config.options, 'proxy_mode': False}):
            res = self.opener.get('/test_http/wsgi_environ', headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()['REMOTE_ADDR'], reverseproxy_ip)
            self.assertEqual(res.json()['HTTP_HOST'], '')

        # Trust proxy-sent forwarded headers
        with patch.object(config, 'options', {**config.options, 'proxy_mode': True}):
            res = self.opener.get('/test_http/wsgi_environ', headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()['REMOTE_ADDR'], client_ip)
            self.assertEqual(res.json()['HTTP_HOST'], host)

    def test_misc2_local_redirect(self):
        def local_redirect(path):
            fake_req = odoo.tools.misc.DotDict(db=False)
            return odoo.http.Request.redirect(fake_req, path, local=True).headers['Location']
        self.assertEqual(local_redirect('https://www.example.com/hello?a=b'), '/hello?a=b')
        self.assertEqual(local_redirect('/hello?a=b'), '/hello?a=b')
        self.assertEqual(local_redirect('hello?a=b'), '/hello?a=b')
        self.assertEqual(local_redirect('www.example.com/hello?a=b'), '/www.example.com/hello?a=b')
        self.assertEqual(local_redirect('https://www.example.comhttps://www.example2.com/hello?a=b'), '/www.example2.com/hello?a=b')
        self.assertEqual(local_redirect('https://https://www.example.com/hello?a=b'), '/www.example.com/hello?a=b')

    def test_misc3_is_static_file(self):
        uri = 'test_http/static/src/img/gizeh.png'
        path = file_path(uri)

        # Valid URLs
        self.assertEqual(root.get_static_file(f'/{uri}'), path, "Valid file")
        self.assertEqual(root.get_static_file(f'odoo.com/{uri}', host='odoo.com'), path, "Valid file with valid host")
        self.assertEqual(root.get_static_file(f'http://odoo.com/{uri}', host='odoo.com'), path, "Valid file with valid host")

        # Invalid URLs
        self.assertIsNone(root.get_static_file('/test_http/i-dont-exist'), "File doesn't exist")
        self.assertIsNone(root.get_static_file('/test_http/__manifest__.py'), "File is not static")
        self.assertIsNone(root.get_static_file(f'odoo.com/{uri}'), "No host allowed")
        self.assertIsNone(root.get_static_file(f'http://odoo.com/{uri}'), "No host allowed")

class TestWsgiMisc(MiscMixin, WsgiCase):
    pass
@tagged('post_install', '-at_install')
class TestHttpMisc(MiscMixin, HttpCase):
    pass

class CorsMixin(HttpTestMixin):
    def test_cors0_http_default(self):
        res_opt = self.opener.options(f'{self.base_url()}/test_http/cors_http_default', timeout=10, allow_redirects=False)
        self.assertIn(res_opt.status_code, (200, 204))
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Methods'), 'GET, POST')
        self.assertEqual(res_opt.headers.get('Access-Control-Max-Age'), '86400')  # one day
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Headers'), 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

        res_get = self.opener.get('/test_http/cors_http_default')
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_get.headers.get('Access-Control-Allow-Methods'), 'GET, POST')

    def test_cors1_http_methods(self):
        res_opt = self.opener.options(f'{self.base_url()}/test_http/cors_http_methods', timeout=10, allow_redirects=False)
        self.assertIn(res_opt.status_code, (200, 204))
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Methods'), 'GET, PUT')
        self.assertEqual(res_opt.headers.get('Access-Control-Max-Age'), '86400')  # one day
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Headers'), 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

        res_post = self.opener.get('/test_http/cors_http_methods')
        self.assertEqual(res_post.status_code, 200)
        self.assertEqual(res_post.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_post.headers.get('Access-Control-Allow-Methods'), 'GET, PUT')

    def test_cors2_json(self):
        res_opt = self.opener.options(f'{self.base_url()}/test_http/cors_json', timeout=10, allow_redirects=False)
        self.assertIn(res_opt.status_code, (200, 204), res_opt.text)
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Methods'), 'POST')
        self.assertEqual(res_opt.headers.get('Access-Control-Max-Age'), '86400')  # one day
        self.assertEqual(res_opt.headers.get('Access-Control-Allow-Headers'), 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

        res_post = self.opener.post('/test_http/cors_json', json={'params': {}})
        self.assertEqual(res_post.status_code, 200)
        self.assertEqual(res_post.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(res_post.headers.get('Access-Control-Allow-Methods'), 'POST')

class TestWsgiCors(CorsMixin, WsgiCase):
    pass

@tagged('post_install', '-at_install')
class TestHttpCors(CorsMixin, HttpCase):
    pass

DB_LIST = ['db0', 'db1']
class EnsureDbMixin(HttpTestMixin):
    @multidb(DB_LIST)
    def test_ensure_db0_db_selector(self):
        res = self.opener.get('/test_http/ensure_db', allow_redirects=False)
        res.raise_for_status()
        self.assertEqual(res.status_code, 303)
        self.assertEqual(urlparse(res.headers.get('Location', '')).path, '/web/database/selector')

    @multidb(DB_LIST)
    def test_ensure_db1_grant_db(self):
        res = self.opener.get('/test_http/ensure_db?db=db0', timeout=10000, allow_redirects=False)
        res.raise_for_status()
        self.assertEqual(res.status_code, 302)
        self.assertEqual(urlparse(res.headers.get('Location', '')).path, '/test_http/ensure_db')
        self.assertEqual(odoo.http.root.session_store.get(res.cookies['session_id']).db, 'db0')

        # follow the redirection
        res = self.opener.get('/test_http/ensure_db')
        res.raise_for_status()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, 'db0')

    @multidb(DB_LIST)
    def test_ensure_db2_use_session_db(self):
        session = self.authenticate(None, None)
        session.db = 'db0'
        odoo.http.root.session_store.save(session)

        res = self.opener.get('/test_http/ensure_db')
        res.raise_for_status()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, 'db0')

    @multidb(DB_LIST)
    def test_ensure_db3_change_db(self):
        session = self.authenticate(None, None)
        session.db = 'db0'
        odoo.http.root.session_store.save(session)

        res = self.opener.get('/test_http/ensure_db?db=db1', allow_redirects=False)
        res.raise_for_status()
        self.assertEqual(res.status_code, 302)
        self.assertEqual(urlparse(res.headers.get('Location', '')).path, '/test_http/ensure_db')

        new_session = odoo.http.root.session_store.get(res.cookies['session_id'])
        self.assertNotEqual(session.sid, new_session.sid)
        self.assertEqual(new_session.db, 'db1')
        self.assertEqual(new_session.uid, None)

        # follow redirection
        self.opener.cookies['session_id'] = new_session.sid
        res = self.opener.get('/test_http/ensure_db')
        res.raise_for_status()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, 'db1')

class TestWsgiEnsureDb(EnsureDbMixin, WsgiCase):
    pass

@tagged('post_install', '-at_install')
class TestHttpEnsureDb(EnsureDbMixin, HttpCase):
    pass
