# -*- coding: utf-8 -*-
from odoo import models


class IrQweb(models.AbstractModel):
    _inherit = ["ir.qweb"]

    def _get_bundles_to_pregenarate(self):
        js_assets, css_assets = super()._get_bundles_to_pregenarate()
        assets = {
            'web_editor.assets_snippets_menu',
            'web_editor.backend_assets_wysiwyg',
            'web_editor.assets_wysiwyg',
            'web_editor.wysiwyg_iframe_editor_assets',
        }
        return (js_assets | assets, css_assets | assets)
