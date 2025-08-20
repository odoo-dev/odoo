# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, modules, fields, api, _
from odoo.tools import config
from odoo.exceptions import UserError, ValidationError, RedirectWarning
from odoo.tools.pdf import PdfFileReader, PdfFileWriter, PdfReadError
from odoo.tools.safe_eval import safe_eval

import io
import logging
import time
from collections import OrderedDict
from PIL import Image

_logger = logging.getLogger(__name__)


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    report_type = fields.Selection(
        selection_add=[('qweb-pdf', 'PDF')],
        ondelete={'qweb-pdf': 'set default'},
        default='qweb-pdf',
    )

    def _handle_merge_pdfs_error(self, error=None, error_stream=None):
        raise UserError(_("Odoo is unable to merge the generated PDFs."))

    @api.model
    def _merge_pdfs(self, streams, handle_error=_handle_merge_pdfs_error):
        writer = PdfFileWriter()
        for stream in streams:
            try:
                reader = PdfFileReader(stream)
                writer.appendPagesFromReader(reader)
            except (PdfReadError, TypeError, NotImplementedError, ValueError) as e:
                handle_error(error=e, error_stream=stream)
        result_stream = io.BytesIO()
        streams.append(result_stream)
        writer.write(result_stream)
        return result_stream

    def _get_pdf_engine_state(self, engine):
        if engine == 'qweb-pdf-none':
            return 'uninstalled' ,  _(
                "No report Engine is installed. Please install and select a"
                " report engine to be able to print pdf reports."
            )
        return 'unknown', _(
            "The report rendering engine '%(engine)s' is not recognized. "
            "Please check the configuration of your Odoo instance.",
            engine=engine
        )

    @api.model
    def get_pdf_engine_state(self, report_ref=None):
        if report_ref is None:
            engine = self.env.company.report_rendering_engine
            return engine, *self._get_pdf_engine_state(engine)

        report_sudo = self._get_report(report_ref)
        report_type = report_sudo.report_type

        if report_type == 'qweb-pdf':
            engine = self.env.company.report_rendering_engine
            return engine, *self._get_pdf_engine_state(engine)

        return report_type, *self._get_pdf_engine_state(report_type)

    def _initialize_pdf_data(self, data):
        if not data:
            data = {}
        data.setdefault('report_type', 'pdf')
        data.setdefault('debug', False)
        return data

    def _collect_existing_streams(self, report_ref, res_ids):
        report_sudo = self._get_report(report_ref)
        has_duplicated_ids = res_ids and len(res_ids) != len(set(res_ids))
        collected_streams = OrderedDict()
        if not res_ids:
            return collected_streams

        records = self.env[report_sudo.model].browse(res_ids)
        for record in records:
            res_id = record.id
            if res_id in collected_streams:
                continue

            stream, attachment = None, None
            if has_duplicated_ids or report_sudo.attachment or self.env.context.get("report_pdf_no_attachment"):
                collected_streams[res_id] = {'stream': stream, 'attachment': attachment}
                continue

            attachment = report_sudo.retrieve_attachment(record)
            if not attachment or report_sudo.attachment_use:
                collected_streams[res_id] = {'stream': stream, 'attachment': attachment}
                continue

            stream = io.BytesIO(attachment.raw)
            if attachment.mimetype.startswith('image'):
                img = Image.open(stream)
                new_stream = io.BytesIO()
                img.convert("RGB").save(new_stream, format="pdf")
                stream.close()
                stream = new_stream

            collected_streams[res_id] = {'stream': stream, 'attachment': attachment}

        return collected_streams

    def _render_qweb_pdf_prepare_no_engine(self, report_ref, data, res_ids=None):
        report_sudo = self._get_report(report_ref)
        has_duplicated_ids = res_ids and len(res_ids) != len(set(res_ids))
        collected_streams = self._collect_existing_streams(
            report_ref=report_sudo,
            res_ids=res_ids,
        )
        res_ids_wo_stream = [
            res_id for res_id, s
            in collected_streams.items()
            if not s['stream']
        ]
        all_streams_ready = res_ids and not res_ids_wo_stream
        # If all streams are already collected, return them no need to raise any error.
        if all_streams_ready:
            return collected_streams

        if self.env.company.rendering_engine == 'None':
            raise UserError(
                _(
                    "No rendering engine is selected for the report"
                    " %(report_name)s (%(report_id)s). "
                    "Please select a rendering engine in the company settings.",
                    report_name=report_sudo.report_name,
                    report_id=report_sudo.id,
                )
            )

        uninstalled_engine = self.env['ir.module.module'].search([
            ('name', 'in',
                [
                    'base_report_wkhtml',
                    'base_report_paper_muncher',
                ]
            ),
            ('state', '=', 'uninstalled'),
        ])

        if not uninstalled_engine:
            raise ValidationError(
                _(
                    "No rendering engine is available for selected"
                    " for the report %(report_name)s (%(report_id)s). "
                    "Please check with your administrator.",
                    report_name = report_sudo.report_name,
                    report_id=report_sudo.id,
                )
            )

        raise RedirectWarning(
            _(
                "No rendering engine is selected for the report"
                " %(report_name)s (%(report_id)s). "
                "Install the corresponding engine %(report_type)s if exists.",
                report_name = report_sudo.report_name,
                report_id = report_sudo.id,
                report_type = dict(
                    self._fields['report_type'].selection
                ).get(report_sudo.report_type),
            ),
            action={
                'name': _('Install A report Engine'),
                'type': 'ir.actions.act_window',
                'res_model': 'ir.module.module',
                'domain': [('id', 'in', uninstalled_engine.ids)],
                'views': [
                    (False, 'kanban'),
                    (False, 'list'),
                    (False, 'form'),
                ],
            },
            button_text=_('Install A report Engine'),
        )

    @api.model
    def _get_rendering_engines(self):
        return {
            'qweb-html': self._render_qweb_html,
            'qweb-text': self._render_qweb_text,
            'none': self._render_qweb_pdf_prepare_no_engine,
        }

    @api.model
    def _get_direct_rendering_engines(self):
        return {}

    @property
    def company_pdf_engine(self):
        engine = self._get_direct_rendering_engines().get(
            self.env.company.report_rendering_engine, None
        )

        if engine == 'qweb-pdf-none':
            raise ValidationError(
                _(
                    "No report Engine is selected. Please install and select "
                    "a report engine to be able to print pdf reports."
                )
            )

        if engine is None:
            raise ValidationError(
                _(
                    "The selected rendering engine '%(engine)s' is not"
                    " available.",
                    engine=self.env.company.report_rendering_engine,
                )
            )

        return engine

    def _select_rendering_engine(self, report_ref):
        report_sudo = self._get_report(report_ref)
        available_engines = self._get_rendering_engines()
        report_type = report_sudo.report_type
        if report_type == 'qweb-pdf':
            selected_engine = self.env.company.report_rendering_engine
        else:
            selected_engine = report_type
        if not (engine := available_engines.get(selected_engine)):
            raise UserError(
                _(
                    "The selected rendering engine '%(engine)s' "
                    "for report '%(report_name)s' is not available.",
                    engine=selected_engine,
                    report_name=report_sudo.report_name,
                )
            )
        return engine

    def _render_qweb_pdf_prepare_streams(self, report_ref, data, res_ids=None):
        engine = self._select_rendering_engine(report_ref)
        return engine(report_ref, data, res_ids=res_ids)

    def _prepare_pdf_report_attachment_vals_list(self, report, streams):
        """Hook to prepare attachment values needed for attachments creation
        during the pdf report generation.

        :param report: The report (with sudo) from a reference report_ref.
        :param streams: Dict of streams for each report containing the pdf content and existing attachments.
        :return: attachment values list needed for attachments creation.
        """
        attachment_vals_list = []
        for res_id, stream_data in streams.items():
            # An attachment already exists.
            if stream_data['attachment']:
                continue

            # if res_id is false
            # we are unable to fetch the record, it won't be saved as we can't split the documents unambiguously
            if not res_id or not stream_data['stream']:
                _logger.warning(
                    "These documents were not saved as an attachment because the template of %s doesn't "
                    "have any headers seperating different instances of it. If you want it saved,"
                    "please print the documents separately", report.report_name)
                continue
            record = self.env[report.model].browse(res_id)
            attachment_name = safe_eval(report.attachment, {'object': record, 'time': time})

            # Unable to compute a name for the attachment.
            if not attachment_name:
                continue

            attachment_vals_list.append({
                'name': attachment_name,
                'raw': stream_data['stream'].getvalue(),
                'res_model': report.model,
                'res_id': record.id,
                'type': 'binary',
            })
        return attachment_vals_list

    def _pre_render_qweb_pdf(self, report_ref, res_ids=None, data=None):
        if not data:
            data = {}
        if isinstance(res_ids, int):
            res_ids = [res_ids]
        data.setdefault('report_type', 'pdf')
        # In case of test environment without enough workers to perform calls to wkhtmltopdf,
        # fallback to render_html.
        if (modules.module.current_test or config['test_enable']) and not self.env.context.get('force_report_rendering'):
            return self._render_qweb_html(report_ref, res_ids, data=data)

        self = self.with_context(webp_as_jpg=True)
        return self._render_qweb_pdf_prepare_streams(report_ref, data, res_ids=res_ids), 'pdf'

    def _render_qweb_pdf(self, report_ref, res_ids=None, data=None):
        if not data:
            data = {}
        if isinstance(res_ids, int):
            res_ids = [res_ids]
        data.setdefault('report_type', 'pdf')

        collected_streams, report_type = self._pre_render_qweb_pdf(report_ref, res_ids=res_ids, data=data)
        if report_type != 'pdf':
            return collected_streams, report_type

        has_duplicated_ids = res_ids and len(res_ids) != len(set(res_ids))

        # access the report details with sudo() but keep evaluation context as current user
        report_sudo = self._get_report(report_ref)

        # Generate the ir.attachment if needed.
        if not has_duplicated_ids and report_sudo.attachment and not self.env.context.get("report_pdf_no_attachment"):
            attachment_vals_list = self._prepare_pdf_report_attachment_vals_list(report_sudo, collected_streams)
            if attachment_vals_list:
                attachment_names = ', '.join(x['name'] for x in attachment_vals_list)
                try:
                    self.env['ir.attachment'].create(attachment_vals_list)
                except AccessError:
                    _logger.info("Cannot save PDF report %r attachments for user %r", attachment_names, self.env.user.display_name)
                else:
                    _logger.info("The PDF documents %r are now saved in the database", attachment_names)

        def custom_handle_merge_pdfs_error(error, error_stream):
            error_record_ids.append(stream_to_ids[error_stream])

        stream_to_ids = {v['stream']: k for k, v in collected_streams.items() if v['stream']}
        # Merge all streams together for a single record.
        streams_to_merge = list(stream_to_ids.keys())
        error_record_ids = []

        if len(streams_to_merge) == 1:
            pdf_content = streams_to_merge[0].getvalue()
        else:
            with self._merge_pdfs(streams_to_merge, custom_handle_merge_pdfs_error) as pdf_merged_stream:
                pdf_content = pdf_merged_stream.getvalue()

        if error_record_ids:
            action = {
                'type': 'ir.actions.act_window',
                'name': _('Problematic record(s)'),
                'res_model': report_sudo.model,
                'domain': [('id', 'in', error_record_ids)],
                'views': [(False, 'list'), (False, 'form')],
            }
            num_errors = len(error_record_ids)
            if num_errors == 1:
                action.update({
                    'views': [(False, 'form')],
                    'res_id': error_record_ids[0],
                })
            raise RedirectWarning(
                message=_('Odoo is unable to merge the generated PDFs because of %(num_errors)s corrupted file(s)', num_errors=num_errors),
                action=action,
                button_text=_('View Problematic Record(s)'),
            )

        for stream in streams_to_merge:
            stream.close()

        if res_ids:
            _logger.info("The PDF report has been generated for model: %s, records %s.", report_sudo.model, str(res_ids))

        return pdf_content, 'pdf'
