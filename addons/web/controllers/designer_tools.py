from odoo import http
from odoo.http import request

# The screens the preview can dress with the values being tried. Order is the
# order of the dropdown; the key names both the template and the URL.
SCREENS = [
    ("kanban", "Kanban"),
    ("list", "List"),
    ("form", "Form"),
    ("settings", "Settings"),
]


class DesignerTools(http.Controller):
    """Serves the palette test page.

    A plain render, nothing else: the page reads the compiled asset bundles
    from the browser and keeps everything it does on the client side. Its
    systray entry only shows in debug mode.
    """

    @http.route("/designer_tools", type="http", auth="user")
    def designer_tools(self, preview=None, screen=None, **kwargs):
        keys = [key for key, _label in SCREENS]
        return request.render("web.designer_tools", {
            "screens": SCREENS,
            # Only the requested mockup is rendered: together they weigh more
            # than the rest of the page.
            "preview": preview is not None,
            "screen": screen if screen in keys else keys[0],
        })
