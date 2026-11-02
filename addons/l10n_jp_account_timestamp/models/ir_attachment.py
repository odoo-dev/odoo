import logging

from psycopg2.errors import UniqueViolation

from odoo import models
from odoo.exceptions import ConcurrencyError, ValidationError

_logger = logging.getLogger(__name__)


class IrAttachment(models.Model):
    _inherit = 'ir.attachment'

    def _post_add_create(self, **kwargs):
        super()._post_add_create(**kwargs)
        self._l10n_jp_register_scanned_documents()

    def _l10n_jp_register_scanned_documents(self):
        # The upload controller uses sudo; preserve evidence with the uploader's rights.
        if not self.env.user.has_group('account.group_account_manager'):
            return
        attachments = self.sudo(False).filtered(
            lambda attachment: attachment.res_model == 'account.move' and attachment.res_id
            and attachment.type == 'binary' and not attachment.res_field and attachment.mimetype in (
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/gif',
            )
        )
        version = self.env['l10n_jp.account.document.version'].sudo(False).with_context(active_test=False)
        preserved = version.search([('source_attachment_id', 'in', attachments.ids)]).source_attachment_id
        # TODO: Confirm classification of emailed/electronic originals and
        # historical backfill with the PO before extending this scan policy.
        for attachment in attachments - preserved:
            move = self.env['account.move'].sudo(False).browse(attachment.res_id)
            if move.company_id.country_id.code != 'JP' or not move.has_access('write'):
                continue
            try:
                with self.env.cr.savepoint():
                    version.create({'move_id': move.id, 'source_attachment_id': attachment.id})
            except UniqueViolation as error:
                if error.diag.constraint_name != version._source_attachment_uniq.full_name(version):
                    raise
                # Retry with a fresh transaction snapshot to see the winner's evidence.
                raise ConcurrencyError('Concurrent Japan scan registration') from error
            except ValidationError as error:
                # Keep the native upload even when its bytes cannot be timestamped.
                _logger.warning('Could not register scanned evidence for attachment %s', attachment.id)
                move.message_post(
                    body=self.env._(
                        'The uploaded file "%(name)s" could not be registered as scanned evidence: %(error)s. '
                        'The attachment was kept. Review it and upload a corrected scan.',
                        name=attachment.name,
                        error=str(error),
                    ),
                    subtype_xmlid='mail.mt_note',
                )
