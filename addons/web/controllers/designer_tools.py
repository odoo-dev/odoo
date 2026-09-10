from werkzeug.exceptions import NotFound

from odoo import http
from odoo.http import request

# The screens the preview can dress with the values being tried. Order is the
# order of the dropdown; the key names both the template and the URL. The third
# field says whether the screen is dressed in the webclient navbar: the app
# screens are, because that is how they are really seen; the Bootstrap gallery
# is not a screen but a sheet of surfaces, and a navbar over it is chrome that
# belongs to nothing.
SCREENS = [
    ("kanban", "Kanban", True),
    ("list", "List", True),
    ("form", "Form", True),
    ("settings", "Settings", True),
    ("bootstrap", "Bootstrap", False),
]


class DesignerTools(http.Controller):
    """Serves the palette test page.

    A plain render, nothing else: the page reads the compiled asset bundles
    from the browser and keeps everything it does on the client side.
    """

    @http.route("/designer_tools", type="http", auth="user")
    def designer_tools(self, preview=None, screen=None, **kwargs):
        # Debug only, like every designer tool. The systray entry already
        # hides itself out of debug mode, but that governs the icon, not the
        # URL. NotFound and not Forbidden: a page that has no business
        # existing here has no business confirming that it does.
        if not request.session.debug:
            raise NotFound()
        keys = [key for key, _label, _navbar in SCREENS]
        return request.render("web.designer_tools", {
            "screens": SCREENS,
            # Looked up by the template rather than searched there.
            "with_navbar": dict((key, navbar) for key, _label, navbar in SCREENS),
            # Only the requested mockup is rendered: together they weigh more
            # than the rest of the page.
            "preview": preview is not None,
            "screen": screen if screen in keys else keys[0],
        })
