# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.exceptions import NotFound

from odoo import http
from odoo.http import request


class DesignerIcons(http.Controller):
    """Serves the Material Symbols browser of the designer tools.

    In this addon and not in ``web`` next to the rest of the designer tools,
    because the metadata the page lives off -- names, fill variants and search
    tags -- is ``ms_icons.py`` here, reached through the existing
    ``/html_editor/material_symbols_search`` route, and ``web`` cannot depend
    on ``html_editor``. The systray menu finds the page through the
    ``designer`` registry, so nothing in ``web`` has to know about it.

    A plain render: the page asks that route for its icons and reads the size
    classes off the compiled bundle, so there is nothing to compute here.
    """

    @http.route("/designer_tools/icons", type="http", auth="user")
    def designer_icons(self, **kwargs):
        # Debug only, like every designer tool. The systray entry already
        # hides itself out of debug mode, but that governs the icon, not the
        # URL. NotFound and not Forbidden: a page that has no business
        # existing here has no business confirming that it does.
        if not request.session.debug:
            raise NotFound()
        return request.render("html_editor.designer_icons", {})
