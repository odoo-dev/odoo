# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import http
from odoo.http import request
from odoo.exceptions import UserError


class TestHttp(http.Controller):

    # =====================================================
    # Greeting
    # =====================================================
    @http.route(['/test_http/greeting', '/test_http/greeting-none'], type='http', auth='none')
    def greeting_none(self):
        return "Tek'ma'te"

    @http.route('/test_http/greeting-public', type='http', auth='public')
    def greeting_public(self):
        assert request.env.user, "ORM should be initialized"
        return "Tek'ma'te"

    @http.route('/test_http/greeting-user', type='http', auth='user')
    def greeting_user(self):
        assert request.env.user, "ORM should be initialized"
        return "Tek'ma'te"

    # =====================================================
    # Echo-Reply
    # =====================================================
    @http.route('/test_http/echo-http-get', type='http', auth='none', methods=['GET'])
    def echo_http_get(self, **kwargs):
        return str(kwargs)

    @http.route('/test_http/echo-http-post', type='http', auth='none', methods=['POST'], csrf=False)
    def echo_http_post(self, **kwargs):
        return str(kwargs)

    @http.route('/test_http/echo-json', type='json', auth='none', methods=['POST'], csrf=False)
    def echo_json(self, **kwargs):
        return kwargs

    @http.route('/test_http/echo-json-context', type='json', auth='user', methods=['POST'], csrf=False)
    def echo_json_context(self, **kwargs):
        return request.env.context

    # =====================================================
    # Models
    # =====================================================
    @http.route('/test_http/<model("test_http.galaxy"):galaxy>', auth='public')
    def galaxy(self, galaxy):
        if not galaxy.exists():
            raise UserError('The Ancients did not settle there.')

        return http.request.render('test_http.tmpl_galaxy', {
            'galaxy': galaxy,
            'stargates': http.request.env['test_http.stargate'].search([
                ('galaxy', '=', galaxy.id)
            ]),
        })

    @http.route('/test_http/<model("test_http.galaxy"):galaxy>/<model("test_http.stargate"):gate>', auth='user')
    def stargate(self, galaxy, gate):
        if not gate.exists():
            raise UserError("The goa'uld destroyed the gate")

        return http.request.render('test_http.tmpl_stargate', {
            'gate': gate
        })

    # =====================================================
    # Misc
    # =====================================================
    @http.route('/test_http/cors_http_default', type='http', auth='none', cors='*')
    def cors_http(self):
        return "Hello"

    @http.route('/test_http/cors_http_methods', type='http', auth='none', methods=['GET', 'PUT'], cors='*')
    def cors_http_verbs(self, **kwargs):
        return "Hello"

    @http.route('/test_http/cors_json', type='json', auth='none', cors='*')
    def cors_json(self, **kwargs):
        return {}
