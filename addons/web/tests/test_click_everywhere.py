# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import random
import odoo.tests

_logger = logging.getLogger(__name__)


@odoo.tests.tagged('click_all', 'post_install', '-at_install', '-standard')
class TestMenusAdmin(odoo.tests.HttpCase):

    def test_01_click_everywhere_as_admin(self):
        menus = self.env['ir.ui.menu'].load_menus(False)
        target_menus = {x for x in menus['root']['children'] if menus[x]['name'] in ('Payroll', 'Settings')}
        random_menus= set(random.choices(menus['root']['children'], k=10))

        for app_id in target_menus | random_menus:
            with self.subTest(app=menus[app_id]['name']):
                _logger.runbot('Testing %s', menus[app_id]['name'])
                self.browser_js("/web", "odoo.__DEBUG__.services['web.clickEverywhere']('%s');" % menus[app_id]['xmlid'], "odoo.isReady === true", login="admin", timeout=300)
                self.terminate_browser()


@odoo.tests.tagged('click_all', 'post_install', '-at_install', '-standard')
class TestMenusDemo(odoo.tests.HttpCase):

    def test_01_click_everywhere_as_demo(self):
        user_demo = self.env.ref("base.user_demo")
        menus = self.env['ir.ui.menu'].with_user(user_demo.id).load_menus(False)
        for app_id in menus['root']['children']:
            if menus[app_id]['name'] in ('Payroll', 'Settings'):
                with self.subTest(app=menus[app_id]['name']):
                    _logger.runbot('Testing %s', menus[app_id]['name'])
                    self.browser_js("/web", "odoo.__DEBUG__.services['web.clickEverywhere']('%s');" % menus[app_id]['xmlid'], "odoo.isReady === true", login="demo", timeout=300)
                    self.terminate_browser()

@odoo.tests.tagged('post_install', '-at_install')
class TestMenusAdminLight(odoo.tests.HttpCase):

    def test_01_click_apps_menus_as_admin(self):
        self.browser_js("/web", "odoo.__DEBUG__.services['web.clickEverywhere'](undefined, true);", "odoo.isReady === true", login="admin", timeout=120)

@odoo.tests.tagged('post_install', '-at_install',)
class TestMenusDemoLight(odoo.tests.HttpCase):

    def test_01_click_apps_menus_as_demo(self):
        self.browser_js("/web", "odoo.__DEBUG__.services['web.clickEverywhere'](undefined, true);", "odoo.isReady === true", login="demo", timeout=120)
