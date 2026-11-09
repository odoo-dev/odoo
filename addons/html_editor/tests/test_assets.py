# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestAssets(TransactionCase):

    def test_lazy_frontend_bundles_not_in_frontend(self):
        IrAsset = self.env['ir.asset']
        params = IrAsset._get_asset_params()

        def get_paths(*bundles):
            return {
                path
                for bundle in bundles
                for path, *_ in IrAsset._get_asset_paths(bundle, params)
            }

        frontend = get_paths('web.assets_frontend', 'web.assets_frontend_minimal')
        # SCSS helpers and variables are needed to compile each bundle.
        scss_helpers = get_paths('web._assets_helpers', 'web._assets_frontend_helpers') | {
            '/web/static/src/scss/pre_variables.scss',
            '/web/static/lib/bootstrap/scss/_variables.scss',
            '/web/static/lib/bootstrap/scss/_variables-dark.scss',
            '/web/static/lib/bootstrap/scss/_maps.scss',
            # icon mixins, needed by the livechat scss
            '/web/static/src/webclient/icons.scss',
            '/web/static/src/webclient/icons_mappings/rtl_icons.scss',
        }
        # Bundles of uninstalled modules are empty.
        for bundle in (
            'html_editor.assets_editor_frontend',
            'im_livechat.assets_embed_frontend',
            'website_profile.assets_html_editor',
        ):
            with self.subTest(bundle=bundle):
                duplicated = get_paths(bundle) & frontend - scss_helpers
                self.assertFalse(
                    duplicated,
                    f"these files are loaded twice in the frontend: remove them from {bundle}",
                )
