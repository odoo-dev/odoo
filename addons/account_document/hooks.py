##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo.api import Environment, SUPERUSER_ID
import logging
_logger = logging.getLogger(__name__)


def document_types_not_updatable(cr, registry):
    _logger.info('Update account.document.type to noupdate=True')
    env = Environment(cr, SUPERUSER_ID, {})
    items = env['ir.model.data'].search([
        ('model', '=', 'account.document.type'),
        ('module', '=', 'account_document'),
    ])
    items = items.write({'noupdate': True})


def post_init_hook(cr, registry):
    """Loaded after installing the module.
    This module's DB modifications will be available.
    :param odoo.sql_db.Cursor cr:
        Database cursor.
    :param odoo.modules.registry.Registry registry:
        Database registry, using v7 api.
    """
    _logger.info('Post init hook initialized')
    document_types_not_updatable(cr, registry)
