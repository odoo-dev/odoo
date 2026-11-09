# Part of Odoo. See LICENSE file for full copyright and licensing details.
import importlib.util

from odoo.modules import Manifest
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestMigrationOfflineState(TransactionCase):
    def test_clean_offline_state(self):
        arch = """<div id="wrap">
            <button id="offline" class="btn o_disabled_offline" disabled="">Buy</button>
            <input id="check" type="checkbox" class="o_disabled_offline" disabled=""/>
            <button id="on_purpose" class="btn" disabled="">Soon</button>
        </div>"""
        view = self.env['ir.ui.view'].create({'name': 'Offline state', 'type': 'qweb', 'key': 'website.test_offline_state', 'arch': arch})

        path = Manifest.for_addon('website').path + '/migrations/1.1/post-clean-offline-state.py'
        spec = importlib.util.spec_from_file_location('clean_offline_state', path)
        script = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(script)
        script.migrate(self.env.cr, '1.0')

        view.invalidate_recordset()
        self.assertNotIn('o_disabled_offline', view.arch_db)
        self.assertIn('<button id="offline" class="btn">', view.arch_db)
        self.assertIn('<input id="check" type="checkbox"/>', view.arch_db)
        self.assertIn('<button id="on_purpose" class="btn" disabled="">', view.arch_db)
