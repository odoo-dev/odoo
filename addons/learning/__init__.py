# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models


def post_init_hook(env):
    # Users who existed before the module was installed are not new to Odoo:
    # they find learning mode in their user menu instead of being greeted.
    env['res.users'].with_context(active_test=False).search([]).learning_offer_pending = False


def uninstall_hook(env):
    env['learning.practice.record'].sudo().search([])._cleanup()
