import logging

from odoo import api, fields, models
from odoo.fields import Domain
from odoo.exceptions import LockError


_logger = logging.getLogger(__name__)


class L10nSaEdiDocument(models.Model):
    _inherit = 'l10n_sa_edi.document'

    pos_order_id = fields.Many2one('pos.order', compute='_compute_resource_id')

    def _get_resource_field_mapping(self):
        return {
            **super()._get_resource_field_mapping(),
            'pos.order': 'pos_order_id',
        }

    def _get_documents_to_retry(self) -> dict:
        """Return documents that should be retried grouped by EGS"""
        return self.search([
            ('res_model', '=', 'pos.order'),
            ('state', '=', 'to_send'),
            ('l10n_sa_chain_index', '!=', 0)
        ]).grouped('journal_id')

    @api.model
    def _get_documents_to_post(self, limit=100) -> dict:
        """Return documents that should be posted grouped by EGS"""
        return self.search([
            ('res_model', '=', 'pos.order'),
            ('state', '=', 'to_send'),
        ]).grouped('journal_id')
    
    def _log_successful_post(self):
        _logger.info("I should log a message to chatter here")
        self.resource.message_post("Successfully posted to zatca, here is the document")

    def _log_failed_post(self, message="", log_only=False):
        _logger.info("I should log a warning to chatter here")
        self.resource.message_post("Successfully posted to zatca, here is the document")

    def _l10n_sa_mark_failed(self, error):
        self.ensure_one()
        self.write({
            'state': 'error',
            'feedback': f"Submission Failed: {error}"
        })
    
    def _l10n_sa_post(self):
        self.ensure_one()
        try:
            self.lock_for_update()
            self.resource.lock_for_update()

            self._l10n_sa_post_zatca_edi()

            if self.state == 'sent':
                self._log_successful_post()
            else:
                self._log_failed_post()

            self.env.cr.commit()
        except LockError:
            self._log_failed_post(message="Document is locked by another process, skipping", log_only=True)
        except Exception as e:
            error = str(e)
            self._log_failed_post(message=error)
            self._l10n_sa_mark_failed(error)
        finally:
            self._l10n_sa_create_log()
            self.env.cr.commit()
            return self.state == 'sent'

    def _cron_l10n_sa_auto_post_documents(self, batch_size=100, retry_only=False):
        documents_by_egs = self._get_documents_to_retry()
        if not retry_only and (to_post := self._get_documents_to_post(limit=batch_size - len(documents_by_egs))):
            for egs, docs in to_post.items():
                if egs in documents_by_egs:
                    documents_by_egs[egs] |= docs
                else:
                    documents_by_egs[egs] = docs

        # Process each group
        total_success = 0
        total_failed = 0

        for egs, documents in documents_by_egs.items():
            for doc in documents:
                if doc._l10n_sa_post():
                    total_success += 1
                else:
                    total_failed += 1
        total_processed  = total_success + total_failed

        _logger.info(
            "ZATCA auto-post completed: %d processed, %d successful, %d failed",
            total_processed, total_success, total_failed
        )
