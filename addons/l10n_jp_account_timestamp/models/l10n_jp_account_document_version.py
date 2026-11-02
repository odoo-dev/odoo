import base64
from datetime import UTC
import os
import uuid

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import pdf
from odoo.tools.binary import BinaryBytes
from odoo.tools.pdf.signature import PdfSigner
from odoo.tools.pdf.timestamp import complete_document_timestamp, load_timestamp_trust, verify_document_timestamp

from odoo.addons.iap.tools.iap_tools import InsufficientCreditError, iap_get_endpoint


class L10nJpAccountDocumentVersion(models.Model):
    _name = 'l10n_jp.account.document.version'
    _description = 'Japan Accounting Scanned Document'
    _order = 'id desc'

    name = fields.Char(
        string='Document',
        compute='_compute_source_document',
        store=True,
        readonly=False,
        precompute=True,
        compute_sudo=False,
        required=True,
    )
    active = fields.Boolean(default=True)
    move_id = fields.Many2one(
        'account.move',
        string='Accounting Entry',
        required=True,
        ondelete='restrict',
        index=True,
    )
    company_id = fields.Many2one(
        related='move_id.company_id',
        store=True,
        precompute=True,
        compute_sudo=False,
        required=True,
        index=True,
    )
    source_attachment_id = fields.Many2one(
        'ir.attachment',
        string='Existing Attachment',
        ondelete='restrict',
    )
    previous_version_id = fields.Many2one('l10n_jp.account.document.version', ondelete='restrict')
    source_file = fields.Binary(
        string='Original Scan',
        compute='_compute_source_document',
        store=True,
        readonly=False,
        precompute=True,
        compute_sudo=False,
        required=True,
        attachment=False,
    )
    source_checksum = fields.Char(
        string='Original SHA-256',
        compute='_compute_source_checksum',
        store=True,
        compute_sudo=False,
    )
    # TODO (PO): agree how missing receipt dates may be supplied/corrected after upload.
    received_at = fields.Datetime(string='Company Receipt Time')
    state = fields.Selection(
        selection=[
            ('queued', 'To Prepare'),
            ('prepared', 'PDF Prepared'),
            ('timestamp_queued', 'Timestamp Queued'),
            ('timestamp_pending', 'Timestamp Pending'),
            ('timestamped', 'Timestamped'),
            ('reconcile', 'Reconciliation Required'),
            ('error', 'Needs Attention'),
            ('unverified', 'Not Verified'),
        ],
        default='queued',
        required=True,
        readonly=True,
        copy=False,
    )
    prepared_file = fields.Binary(
        readonly=True,
        attachment=False,
        copy=False,
    )
    normalized_digest = fields.Char(
        string='Prepared PDF SHA-256',
        readonly=True,
        copy=False,
    )
    last_error = fields.Text(
        string='Action Required',
        readonly=True,
        copy=False,
    )
    retry_at = fields.Datetime(
        string='Next Retry',
        readonly=True,
        copy=False,
    )
    timestamp_revision = fields.Binary(readonly=True, attachment=False, copy=False)
    timestamp_nonce = fields.Char(readonly=True, copy=False)
    timestamp_digest = fields.Char(readonly=True, copy=False)
    timestamp_policy = fields.Char(readonly=True, copy=False)
    timestamp_mode = fields.Selection(
        selection=[('test', 'Test'), ('production', 'Production')],
        readonly=True,
        copy=False,
    )
    timestamp_account_token = fields.Char(readonly=True, copy=False, groups='base.group_system')
    timestamp_file = fields.Binary(string='Timestamped PDF', readonly=True, attachment=False, copy=False)
    timestamp_filename = fields.Char(compute='_compute_timestamp_filename')
    timestamped_at = fields.Datetime(readonly=True, copy=False)
    timestamp_response_token = fields.Binary(readonly=True, attachment=False, copy=False)
    # Attachment storage deduplicates identical CRL snapshots in the filestore.
    timestamp_validation_crls = fields.Binary(readonly=True, copy=False)

    _source_attachment_uniq = models.Constraint(
        'UNIQUE(source_attachment_id)',
        'This attachment already has a preserved scan. Upload a new attachment for a replacement.',
    )

    @api.depends('name')
    def _compute_timestamp_filename(self):
        for document in self:
            document.timestamp_filename = os.path.splitext(document.name or 'scan')[0] + '-timestamped.pdf'

    @api.depends('source_attachment_id')
    def _compute_source_document(self):
        # Do not depend on attachment.raw: later attachment edits must not change a saved scan.
        for document in self:
            if document.source_attachment_id:
                document.name = document.source_attachment_id.name
                document.source_file = BinaryBytes(document.source_attachment_id.raw.content)
            else:
                document.name = document.name or False
                document.source_file = document.source_file or False

    @api.depends('source_file')
    def _compute_source_checksum(self):
        for document in self:
            document.source_checksum = BinaryBytes(document.source_file.content).checksum if document.source_file else False

    @api.constrains(
        'move_id',
        'company_id',
        'source_attachment_id',
        'previous_version_id',
    )
    def _check_document_links(self):
        for document in self:
            move = document.move_id
            move.check_access('write')
            if move.company_id.country_id.code != 'JP' or document.company_id != move.company_id:
                raise ValidationError(self.env._('Select an entry belonging to a Japanese company.'))
            attachment = document.source_attachment_id
            if attachment and (attachment.res_model != 'account.move' or attachment.res_id != move.id or attachment.type != 'binary'):
                raise ValidationError(self.env._('Select a binary attachment on this accounting entry.'))
            if document.previous_version_id:
                document.previous_version_id.check_access('read')
                if document.previous_version_id.move_id != move:
                    raise ValidationError(self.env._('The previous version must belong to this entry.'))

    @api.constrains('source_file', 'source_checksum')
    def _check_source_file(self):
        for document in self:
            if not document.source_file or document.source_file.mimetype not in (
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/gif',
            ):
                raise ValidationError(self.env._('Upload a PDF, PNG, JPEG or GIF scan.'))
            if document.source_checksum != BinaryBytes(document.source_file.content).checksum:
                raise ValidationError(self.env._('The original document fingerprint does not match.'))

    @api.model_create_multi
    def create(self, vals_list):
        protected_fields = {
            'company_id',
            'source_checksum',
            'state',
            'prepared_file',
            'normalized_digest',
            'last_error',
            'retry_at',
            'timestamp_revision',
            'timestamp_nonce',
            'timestamp_digest',
            'timestamp_policy',
            'timestamp_mode',
            'timestamp_account_token',
            'timestamp_file',
            'timestamped_at',
            'timestamp_validation_crls',
            'timestamp_response_token',
        }
        for vals in vals_list:
            if protected_fields.intersection(vals):
                raise UserError(self.env._('Document preparation fields cannot be supplied manually.'))
            if attachment_id := vals.get('source_attachment_id'):
                attachment = self.env['ir.attachment'].browse(attachment_id)
                attachment.check_access('read')
                vals.update({
                    'name': attachment.name,
                    'source_file': BinaryBytes(attachment.raw.content),
                })
            vals.update({
                'state': 'queued',
                'prepared_file': False,
                'normalized_digest': False,
                'last_error': False,
                'retry_at': False,
            })
        return super().create(vals_list)

    def write(self, vals):
        if any(field_name != 'active' for field_name in vals):
            raise UserError(self.env._('Create a replacement scan instead of editing preserved evidence.'))
        return super().write(vals)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_uninstall(self):
        raise UserError(self.env._('Archive the scan instead of deleting it.'))

    def action_prepare_document(self):
        self.ensure_one()
        self.check_access('write')
        document = self.try_lock_for_update()
        if not document or document.state not in ('queued', 'error') or document.normalized_digest:
            raise UserError(self.env._('Only a document without a prepared PDF can be prepared or retried.'))
        document._prepare_document()
        return True

    def _check_document_fingerprints(self):
        self.ensure_one()
        source = self.prepared_file or self.source_file
        if (not self.source_file or not source or not self.normalized_digest
                or BinaryBytes(self.source_file.content).checksum != self.source_checksum
                or BinaryBytes(source.content).checksum != self.normalized_digest):
            raise ValueError(self.env._('The preserved original or prepared PDF changed.'))
        revision = self.timestamp_revision or self.timestamp_file
        if revision and not revision.content.startswith(source.content):
            raise ValueError(self.env._('The timestamp revision does not contain the preserved prepared PDF.'))

    def _verify_timestamp(self):
        self.ensure_one()
        self._check_document_fingerprints()
        if not self.timestamp_validation_crls:
            raise ValueError('The issuance-time verification material is missing')
        if not self.timestamped_at:
            raise ValueError(self.env._('The recorded timestamp issuance time is missing.'))
        configuration = self._timestamp_configuration()
        roots, crls = load_timestamp_trust(
            configuration['roots'].encode(), self.timestamp_validation_crls.content,
            at_time=self.timestamped_at.replace(tzinfo=UTC),
        )
        metadata = verify_document_timestamp(
            self.timestamp_file.content, bytes.fromhex(self.timestamp_digest),
            int(self.timestamp_nonce, 16), self.timestamp_policy, roots, crls,
            not_before=self.create_date.replace(tzinfo=UTC),
        )
        if metadata['generated_at'].replace(tzinfo=None, microsecond=0) != self.timestamped_at.replace(microsecond=0):
            raise ValueError(self.env._('The recorded issuance time does not match the timestamp token.'))
        return metadata

    def action_check_integrity(self):
        self.ensure_one()
        self.check_access('write')
        document = self.try_lock_for_update()
        if not document or not document.normalized_digest:
            raise UserError(self.env._('Prepare the PDF before checking its integrity.'))
        if document.timestamp_file:
            try:
                document._verify_timestamp()
            except ValueError as error:
                super(L10nJpAccountDocumentVersion, document).write({'state': 'unverified', 'last_error': str(error)})
                return {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {
                    'title': self.env._('Timestamp Verification Failed'),
                    'message': str(error), 'type': 'danger', 'sticky': True,
                    'next': {'type': 'ir.actions.client', 'tag': 'reload'},
                }}
            super(L10nJpAccountDocumentVersion, document).write({'state': 'timestamped', 'last_error': False})
            return {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {
                'title': self.env._('Timestamp Verified'),
                'message': self.env._('The stored files and timestamp signature match the preserved issuance evidence.'),
                'type': 'success',
            }}
        prepared_pdf = document.prepared_file or document.source_file
        matches = (
            document.source_file
            and document.source_checksum == BinaryBytes(document.source_file.content).checksum
            and prepared_pdf
            and document.normalized_digest == BinaryBytes(prepared_pdf.content).checksum
        )
        super(L10nJpAccountDocumentVersion, document).write({
            'state': (document.state if document.timestamp_nonce else 'prepared') if matches else 'unverified',
            'last_error': (document.last_error if document.timestamp_nonce else False) if matches else self.env._('The stored files do not match their recorded fingerprints. Preserve them and investigate before adding a replacement.'),
        })
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': self.env._('Document Integrity'),
                'message': self.env._('Stored files match their fingerprints. This is not TSA timestamp verification.') if matches else document.last_error,
                'type': 'success' if matches else 'danger',
                'sticky': not matches,
                'next': {'type': 'ir.actions.client', 'tag': 'reload'},
            },
        }

    def action_set_main_document(self):
        self.ensure_one()
        self.check_access('write')
        self.move_id.check_access('write')
        if not self.move_id.is_invoice(include_receipts=True):
            raise UserError(self.env._('Select a bill or invoice for the main document.'))
        attachment = self.source_attachment_id
        if not attachment:
            attachment = self.env['ir.attachment'].create({
                'name': self.name,
                'raw': self.source_file,
                'res_model': 'account.move',
                'res_id': self.move_id.id,
            })
            super().write({'source_attachment_id': attachment.id})
        attachment.check_access('read')
        if not attachment.raw or BinaryBytes(attachment.raw.content).checksum != self.source_checksum:
            raise UserError(self.env._('The original attachment changed after evidence registration.'))
        self.move_id._message_set_main_attachment_id(attachment, force=True)
        return True

    def action_create_replacement(self):
        self.ensure_one()
        self.check_access('read')
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Upload Replacement Scan'),
            'res_model': self._name,
            'view_mode': 'form',
            'target': 'current',
            'context': {'default_move_id': self.move_id.id, 'default_previous_version_id': self.id},
        }

    def _prepare_document(self):
        self.ensure_one()
        try:
            self._check_source_file()
            # Use the preserved bytes, not an attachment which may have been edited.
            attachment = self.env['ir.attachment'].new({
                'name': self.name,
                'raw': self.source_file,
                'mimetype': self.source_file.mimetype,
                'type': 'binary',
            })
            stream = pdf.to_pdf_stream(attachment)
            if stream is None:
                raise ValidationError(self.env._('The document could not be converted to PDF.'))
            with stream:
                if not pdf.PdfFileReader(stream, strict=False).pages:
                    raise ValidationError(self.env._('The prepared PDF must contain at least one page.'))
                prepared_pdf = BinaryBytes(stream.getvalue())
        except (
            UserError,
            OSError,
            ValueError,
            pdf.PdfReadError,
        ) as error:
            super().write({
                'state': 'error',
                'last_error': str(error),
                # Retry OS-level I/O failures, not decoder errors without an errno.
                # This is not a TSA rate limit or a paid issuance retry policy.
                'retry_at': fields.Datetime.add(fields.Datetime.now(), minutes=1) if isinstance(error, OSError) and error.errno else False,
            })
            return
        super().write({
            'state': 'prepared',
            'prepared_file': prepared_pdf if self.source_file.mimetype != 'application/pdf' else False,
            'normalized_digest': prepared_pdf.checksum,
            'last_error': False,
            'retry_at': False,
        })

    def _timestamp_configuration(self):
        # Only administrator-owned service/trust settings are elevated.
        parameters = self.env['ir.config_parameter'].sudo()
        mode = parameters.get_str('l10n_jp_account_timestamp.timestamp_mode', 'test')
        if self:
            self.ensure_one()
            mode = self.timestamp_mode or mode
        prefix = 'l10n_jp_account_timestamp.' + ('test_' if mode == 'test' else '')
        return {
            'enabled': parameters.get_bool('l10n_jp_account_timestamp.timestamp_enabled'),
            'mode': mode,
            'endpoint': parameters.get_str('l10n_jp_account_timestamp.iap_endpoint') or iap_get_endpoint(self.env),
            'policy': parameters.get_str(prefix + 'policy_oid'),
            'roots': parameters.get_str(prefix + 'trust_roots'),
            'crls': parameters.get_str(prefix + 'crls'),
        }

    def action_queue_timestamp(self):
        self.ensure_one()
        self.check_access('write')
        document = self.try_lock_for_update()
        if not document or document.state not in ('prepared', 'error') or document.timestamp_file:
            raise UserError(self.env._('Only an unstamped prepared scan can be queued.'))
        document._queue_timestamp()
        return True

    def _queue_timestamp(self):
        self.ensure_one()
        configuration = self._timestamp_configuration()
        if not all(configuration.values()):
            raise UserError(self.env._('Enable timestamping and configure the IAP server, policy, trust anchors and current CRLs.'))
        load_timestamp_trust(configuration['roots'].encode(), configuration['crls'].encode())
        try:
            self._check_document_fingerprints()
        except ValueError as error:
            raise UserError(self.env._('The prepared scan changed. Preserve it and investigate before timestamping.')) from error
        source = self.prepared_file or self.source_file
        if self.timestamp_revision:
            if not self.timestamp_mode:
                raise UserError(self.env._('The existing timestamp request has no mode. Review it before retrying.'))
            # A retry always retains its original nonce, signing bytes and account identity.
            super().write({'state': 'timestamp_queued', 'last_error': False, 'retry_at': False})
            return
        nonce = uuid.uuid4().hex
        prepared = PdfSigner(source.content).write_document_timestamp_placeholder(field_name='Japan timestamp ' + nonce)
        if not prepared:
            raise UserError(self.env._('This PDF cannot contain a document timestamp.'))
        account = self.env['iap.account'].with_company(self.company_id).get('l10n_jp_timestamp_proxy')
        # Only generated timestamp values are written with sudo: the pinned account
        # secret is restricted to system administrators and is never returned to callers.
        super(L10nJpAccountDocumentVersion, self.sudo()).write({
            'timestamp_revision': BinaryBytes(bytes(prepared.pdf_data)),
            'timestamp_digest': prepared.digest.hex(),
            'timestamp_nonce': nonce,
            'timestamp_policy': configuration['policy'],
            'timestamp_mode': configuration['mode'],
            'timestamp_validation_crls': BinaryBytes(configuration['crls'].encode()),
            'timestamp_account_token': account.sudo().account_token,
            'state': 'timestamp_queued',
            'last_error': False,
            'retry_at': False,
        })

    def action_retry_timestamp_verification(self):
        self.ensure_one()
        self.check_access('write')
        document = self.try_lock_for_update()
        if not document or document.state != 'unverified' or not document.timestamp_response_token:
            raise UserError(self.env._('Only a received timestamp awaiting verification can be retried.'))
        super(L10nJpAccountDocumentVersion, document).write({
            'state': 'timestamp_pending', 'last_error': False, 'retry_at': False,
        })
        return True

    def _finalize_timestamp(self, configuration):
        self.ensure_one()
        self._check_document_fingerprints()
        bundles = [configuration['crls'].encode()]
        if self.timestamp_validation_crls:
            bundles.insert(0, self.timestamp_validation_crls.content)
        material = b'\n'.join(dict.fromkeys(bundles))
        # Old CRLs are decoded, then checked against signed issuance time by the
        # verifier. This is retained issuance evidence, not an LTV renewal policy.
        roots, crls = load_timestamp_trust(configuration['roots'].encode(), material, allow_historical=True)
        final_pdf, metadata = complete_document_timestamp(
            self.timestamp_revision.content, self.timestamp_response_token.content,
            bytes.fromhex(self.timestamp_digest), int(self.timestamp_nonce, 16),
            self.timestamp_policy, roots, crls,
            not_before=self.create_date.replace(tzinfo=UTC),
        )
        super(L10nJpAccountDocumentVersion, self.sudo()).write({
            'timestamp_file': BinaryBytes(final_pdf),
            'timestamped_at': metadata['generated_at'].replace(tzinfo=None),
            'timestamp_validation_crls': BinaryBytes(material),
            'timestamp_revision': False,
            'timestamp_response_token': False,
            'timestamp_account_token': False,
            'state': 'timestamped',
            'last_error': False,
            'retry_at': False,
        })

    @api.model
    def _timestamp_error_message(self, code):
        messages = {
            'insufficient_credit': self.env._('There are not enough IAP credits. Ask an administrator to replenish the account using Manage IAP Credits in Accounting settings.'),
            'test_access_denied': self.env._('This database and IAP account are not approved for timestamp testing. Ask the IAP administrator to enable test access.'),
            'service_not_configured': self.env._('The timestamp service is not configured for the selected mode. Contact the IAP administrator.'),
            'invalid_service_configuration': self.env._('The timestamp service configuration is invalid. Contact the IAP administrator.'),
            'provider_authentication_failed': self.env._('The timestamp provider rejected the service credentials. Contact the IAP administrator.'),
            'provider_quota_exhausted': self.env._('The timestamp provider quota is exhausted. Contact the IAP administrator.'),
            'too_many_requests': self.env._('The IAP request limit was reached. Odoo will check the existing request again.'),
            'iap_outcome_unknown': self.env._('The IAP response was lost. Odoo will check the existing request before retrying.'),
            'invalid_iap_response': self.env._('The IAP response could not be read. Odoo will check the existing request again.'),
        }
        return messages.get(code, self.env._('The timestamp request needs administrator review. Check its service configuration and existing outcome before retrying.'))

    def _process_timestamp(self):
        self.ensure_one()
        # Isolate the scheduled worker from caller transactions. Native cron
        # checkpoints preserve intent before external calls and honor its budget.
        with self.env.registry.cursor() as cr:
            env = api.Environment(cr, self.env.uid, dict(self.env.context, allowed_company_ids=self.company_id.ids))
            document = env[self._name].browse(self.id).try_lock_for_update()
            if not document or document.timestamp_file or (document.retry_at and document.retry_at > fields.Datetime.now()):
                return
            if document.state not in ('prepared', 'timestamp_queued', 'timestamp_pending'):
                return
            configuration = document._timestamp_configuration()
            if document.state in ('timestamp_queued', 'timestamp_pending') and not document.timestamp_mode and not document.timestamp_response_token:
                super(L10nJpAccountDocumentVersion, document).write({
                    'state': 'reconcile',
                    'last_error': env._('The existing timestamp request has no mode. Review it before retrying.'),
                    'retry_at': False,
                })
                return
            configuration_error = False
            if not document.timestamp_response_token and not configuration['endpoint']:
                configuration_error = env._('Configure the timestamp IAP server.')
            elif document.state in ('prepared', 'timestamp_queued'):
                try:
                    load_timestamp_trust(configuration['roots'].encode(), configuration['crls'].encode())
                except ValueError as error:
                    configuration_error = str(error)
            if configuration_error:
                # An unavailable trust/configuration dependency pauses the queue;
                # it does not make the preserved scan invalid or discard its intent.
                super(L10nJpAccountDocumentVersion, document).write({
                    'last_error': configuration_error,
                    'retry_at': fields.Datetime.add(fields.Datetime.now(), minutes=1),
                })
                return
            try:
                if document.state == 'prepared':
                    if not document.active or not configuration['enabled']:
                        return
                    document._queue_timestamp()
                    if not env['ir.cron']._commit_progress():
                        return
                if document.state not in ('timestamp_queued', 'timestamp_pending'):
                    return
                if not document.timestamp_response_token:
                    submitting = document.state == 'timestamp_queued'
                    if submitting and (not document.active or not configuration['enabled']):
                        return
                    super(L10nJpAccountDocumentVersion, document).write({
                        'state': 'timestamp_pending',
                        'retry_at': fields.Datetime.add(fields.Datetime.now(), minutes=1),
                    })
                    if not env['ir.cron']._commit_progress():
                        return
                    client = env['iap.account'].with_company(document.company_id)
                    # Reading only this document's pinned IAP account token is elevated.
                    token = document.sudo().timestamp_account_token
                    if not token:
                        super(L10nJpAccountDocumentVersion, document).write({
                            'state': 'error',
                            'last_error': env._('The timestamp request account identity is missing.'),
                            'retry_at': False,
                        })
                        return
                    if submitting:
                        response = client._l10n_jp_request_timestamp(
                            document.timestamp_digest, document.timestamp_nonce,
                            account_token=token, policy_oid=document.timestamp_policy,
                            mode=document.timestamp_mode,
                        )
                    else:
                        response = client._l10n_jp_timestamp_status(document.timestamp_nonce, account_token=token, mode=document.timestamp_mode)
                        if response.get('status') == 'not_found':
                            if not document.active or not configuration['enabled']:
                                # No remote intent exists to retrieve. Pause locally until
                                # the scan/service is enabled instead of polling forever.
                                super(L10nJpAccountDocumentVersion, document).write({
                                    'state': 'timestamp_queued',
                                    'retry_at': False,
                                    'last_error': False,
                                })
                                return
                            # If acceptance was lost, replay the same nonce. IAP deduplicates it.
                            response = client._l10n_jp_request_timestamp(
                                document.timestamp_digest, document.timestamp_nonce,
                                account_token=token, policy_oid=document.timestamp_policy,
                                mode=document.timestamp_mode,
                            )
                    if response.get('status') == 'done':
                        super(L10nJpAccountDocumentVersion, document.sudo()).write({
                            'timestamp_response_token': BinaryBytes(base64.b64decode(response['token'], validate=True)),
                            'timestamp_account_token': False,
                        })
                        if not env['ir.cron']._commit_progress():
                            return
                    elif response.get('error'):
                        values = {'last_error': document._timestamp_error_message(response['error'])}
                        if response['error'] not in ('iap_outcome_unknown', 'invalid_iap_response', 'too_many_requests'):
                            values.update({
                                'state': 'reconcile' if response.get('status') == 'reconcile' else 'error',
                                'retry_at': False,
                            })
                        super(L10nJpAccountDocumentVersion, document).write(values)
                if document.timestamp_response_token:
                    try:
                        document._finalize_timestamp(configuration)
                    except ValueError as error:
                        super(L10nJpAccountDocumentVersion, document).write({
                            'state': 'unverified',
                            'last_error': str(error),
                            'retry_at': False,
                        })
            except (UserError, InsufficientCreditError, ValueError) as error:
                message = document._timestamp_error_message('insufficient_credit') if isinstance(error, InsufficientCreditError) else str(error)
                super(L10nJpAccountDocumentVersion, document).write({'state': 'error', 'last_error': message, 'retry_at': False})

    @api.model
    def _cron_process_document_timestamps(self):
        configuration = self._timestamp_configuration()
        domain = fields.Domain('state', '=', 'timestamp_pending')
        if configuration['enabled']:
            domain |= fields.Domain('active', '=', True) & fields.Domain('state', 'in', ['prepared', 'timestamp_queued'])
        domain &= fields.Domain('retry_at', '=', False) | fields.Domain('retry_at', '<=', fields.Datetime.now())
        cron = self.env['ir.cron']
        if not cron._commit_progress(remaining=self.with_context(active_test=False).search_count(domain)):
            return
        for document in self.with_context(active_test=False).search(domain, order='create_date, id', limit=20):
            document._process_timestamp()
            if not cron._commit_progress(1):
                break

    @api.model
    def _cron_process_timestamp_queue(self):
        """Prepare local PDFs and retry due I/O failures; never issue TSA requests."""
        domain = fields.Domain('active', '=', True) & (
            fields.Domain('state', '=', 'queued')
            | (
                fields.Domain('state', '=', 'error')
                & fields.Domain('retry_at', '!=', False)
                & fields.Domain('retry_at', '<=', fields.Datetime.now())
            )
        )
        if self.env.context.get('cron_id'):
            self.env['ir.cron']._commit_progress(remaining=self.search_count(domain))
        documents = self.search(
            domain,
            limit=20,
            order='retry_at ASC NULLS FIRST, create_date, id',
        )
        for document in documents:
            document = document.try_lock_for_update().filtered_domain(domain)
            if document:
                document._prepare_document()
                if self.env.context.get('cron_id') and not self.env['ir.cron']._commit_progress(1):
                    break
