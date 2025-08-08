from odoo.exceptions import AccessDenied
from odoo import http
import odoo.tools
import odoo.service
DBNAME_PATTERN = '^[a-zA-Z0-9][a-zA-Z0-9_.-]+$'
request = http.request
from odoo.tools import file_open
from lxml import html
from odoo.addons.base.models.ir_qweb import render as qweb_render
import logging
_logger = logging.getLogger(__name__)

class IndexController(http.Controller):
    @http.route(['/', '/odoo'], type='http', auth='none')
    def index(self, db=None, **kw):
        if db:
            from odoo.addons.web.controllers import utils  # move to security
            utils.ensure_db('/odoo', db=db)
        _logger.info("Default controller, no database")
        return self._render_template()

    def _render_template(self, **d):
        d['manage'] = False
        d['insecure'] = odoo.tools.config.verify_admin_password('admin')
        d['list_db'] = odoo.tools.config['list_db']
        d['langs'] = odoo.service.db.exp_list_lang()
        d['countries'] = odoo.service.db.exp_list_countries()
        d['pattern'] = DBNAME_PATTERN
        # databases list
        try:
            d['databases'] = http.db_list()
            d['incompatible_databases'] = odoo.service.db.list_db_incompatible(d['databases'])
        except odoo.exceptions.AccessDenied:
            d['databases'] = [request.db] if request.db else []

        templates = {}

        # XXX need to have a specific one for base
        with file_open("web/static/src/public/database_manager.qweb.html", "r") as fd:
            templates['database_manager'] = fd.read()

        def load(template_name):
            fromstring = html.document_fromstring if template_name == 'database_manager' else html.fragment_fromstring
            return (fromstring(templates[template_name]), template_name)

        return qweb_render('database_manager', d, load)
