import logging

from odoo import api, models
from odoo.fields import Domain
from odoo.exceptions import LockError


_logger = logging.getLogger(__name__)


class L10nSaEdiDocument(models.Model):
    _inherit = 'l10n_sa_edi.document'

    pos_order_id = fields.Many2one('pos.order', compute='_compute_resource_id')

    def _get_resource_field_mapping(self):
        return {
            **super()._get_resource_field_mapping(),
            'pos.order': pos_order_id,
        }

    @api.model
    def _get_auto_post_search_domain(self):
        """Get domain for finding documents that need auto-posting"""
        return [
            ('state', '=', 'to_send'),
            ('res_model', '=', 'pos.order'),
        ]

    def _cron_l10n_sa_auto_post_documents(self, batch_size=100):
        """
        Cron job to automatically post POS orders to ZATCA.

        Processing logic:
        1. Documents with existing chain_index are processed first (retries)
        2. Documents are grouped by company and journal
        3. Within each group, documents are ordered by confirmation datetime
        4. Each document is processed individually with proper error handling
        5. Failed documents remain in 'to_send' or 'error' state for retry

        :param batch_size: Maximum number of documents to process in one run
        """
        # First, find all documents that need posting
        domain = self._get_auto_post_search_domain()

        # Order by: chain_index DESC (retries first), then confirmation datetime ASC
        all_docs = self._read_group(
            domain,
            order='l10n_sa_chain_index DESC NULLS LAST, id ASC',
            limit=batch_size,
            groupby='res_model',
        )

        if not all_docs:
            _logger.info("No POS documents to auto-post to ZATCA")
            return

        # Process each group
        total_processed = 0
        total_success = 0
        total_failed = 0

        for doc in docs:
            try:
                doc.lock_for_update()
                doc.resource.lock_for_update()

                _logger.debug(
                    "Posting ZATCA document %d for %s %s (chain index: %s)",
                    doc.id, doc.res_model, doc.res_id, doc.l10n_sa_chain_index or 'new'
                )

                # Post to ZATCA
                doc._l10n_sa_post_zatca_edi()

                if doc.state == 'sent':
                    total_success += 1
                    _logger.info(
                        "Successfully posted document %d for order %s",
                        doc.id, order.name
                    )
                else:
                    total_failed += 1
                    _logger.warning(
                        "Failed to post document %d for order %s: %s",
                        doc.id, order.name, doc.feedback or 'Unknown error'
                    )

                total_processed += 1

                # Commit after each successful processing to avoid losing progress
                self.env.cr.commit()

            except LockError:
                _logger.warning(
                    "Document %d is locked by another process, skipping",
                    doc.id
                )
                continue

            except Exception as e:
                # Log error but continue with other documents
                _logger.error(
                    "Unexpected error posting document %d: %s",
                    doc.id, str(e), exc_info=True
                )
                total_failed += 1

                # Mark document as error if not already
                try:
                    if doc.state != 'error':
                        doc.write({
                            'state': 'error',
                            'feedback': f"Cron error: {str(e)}"
                        })
                        doc._l10n_sa_create_log()
                    self.env.cr.commit()
                except Exception as commit_error:
                    _logger.error(
                        "Failed to save error state for document %d: %s",
                        doc.id, str(commit_error)
                    )
                    self.env.cr.rollback()
                continue

        _logger.info(
            "ZATCA auto-post completed: %d processed, %d successful, %d failed",
            total_processed, total_success, total_failed
        )
