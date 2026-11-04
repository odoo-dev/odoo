import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class IrAttachment(models.Model):
    _inherit = 'ir.attachment'

    @api.autovacuum
    def _gc_doc_index(self):
        """ Garbage collect the old /doc/index.json attachments. Their name
        depends on the registry of the server that made them, so the current
        ones can't be told apart from the outdated ones. """
        attachments = self.search([
            ('name', 'like', R'odoo-doc-index-%-%.json'),
            ('create_date', '<', fields.Datetime.subtract(fields.Datetime.now(), days=1)),
        ])
        if attachments:
            attachments.unlink()
        _logger.info("GC'd %s /doc cached index", len(attachments))
