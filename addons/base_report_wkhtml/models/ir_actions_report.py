# Part of Odoo. See LICENSE file for full copyright and licensing details.

import io
import logging
import os
import subprocess
import tempfile
from contextlib import ExitStack, closing
from markupsafe import Markup
from urllib.parse import urlparse
from lxml import etree
import lxml.html

from odoo import models, modules, fields, api, tools, _
from odoo.exceptions import UserError
from odoo.http import root, request
from odoo.service import security
from odoo.tools import parse_version
from odoo.tools.pdf import PdfFileReader, PdfFileWriter
from odoo.addons.base_report_wkhtml.engine.utils import _wkhtml, _run_wkhtmltopdf, _split_table

_logger = logging.getLogger(__name__)


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    report_type = fields.Selection(
        selection_add=[
            ('qweb-pdf-wkhtml', 'QWeb PDF (wkhtmltopdf)'),
        ],
        ondelete={
            'qweb-pdf-wkhtml': 'set default',
        }
    )

    def _get_pdf_engine_state(self, engine):
        if engine == 'qweb-pdf-wkhtml':
            status = self.get_wkhtmltopdf_state()
            link = Markup(
                '<br><br><a href="http://wkhtmltopdf.org/"'
                ' target="_blank">wkhtmltopdf.org</a>'
            )
            if status == 'broken':
                message = _(
                    "Your installation of Wkhtmltopdf seems to be broken. "
                    "The report will be shown in html.%(link)s",
                    link=link
                )
            elif status == 'install':
                message = _(
                    "Unable to find Wkhtmltopdf on this system. "
                    "The report will be shown in html.%(link)s",
                    link=link
                )
            elif status == 'upgrade':
                message = _(
                    "You should upgrade your version of Wkhtmltopdf "
                    "to at least 0.12.0 in order to get a correct display "
                    "of headers and footers as well as "
                    "support for table-breaking between pages.%(link)s",
                    link=link
                )
            elif status == 'workers':
                message = _(
                    "You need to start Odoo with at least two workers "
                    "to print a pdf version of the reports."
                )
            else:
                message = _(
                    "Wkhtmltopdf is ready to use. "
                    "You can now print your reports in pdf format."
                )
            return status, message
        return super()._get_pdf_engine_state(engine)

    @api.model
    def get_wkhtmltopdf_state(self):
        '''Get the current state of wkhtmltopdf: install, ok, upgrade, workers or broken.
        * install: Starting state.
        * upgrade: The binary is an older version (< 0.12.0).
        * ok: A binary was found with a recent version (>= 0.12.0).
        * workers: Not enough workers found to perform the pdf rendering process (< 2 workers).
        * broken: A binary was found but not responding.

        :return: wkhtmltopdf_state
        '''
        return _wkhtml().state

    @api.model
    def _build_wkhtmltopdf_args(
            self,
            paperformat_id,
            landscape,
            specific_paperformat_args=None,
            set_viewport_size=False):
        '''Build arguments understandable by wkhtmltopdf bin.

        :param paperformat_id: A report.paperformat record.
        :param landscape: Force the report orientation to be landscape.
        :param specific_paperformat_args: A dictionary containing prioritized wkhtmltopdf arguments.
        :param set_viewport_size: Enable a viewport sized '1024x1280' or '1280x1024' depending of landscape arg.
        :return: A list of string representing the wkhtmltopdf process command args.
        '''
        if landscape is None and specific_paperformat_args and specific_paperformat_args.get('data-report-landscape'):
            landscape = specific_paperformat_args.get('data-report-landscape')

        command_args = ['--disable-local-file-access']
        if set_viewport_size:
            command_args.extend(['--viewport-size', landscape and '1024x1280' or '1280x1024'])

        # Less verbose error messages
        command_args.extend(['--quiet'])

        # Build paperformat args
        if paperformat_id:
            if paperformat_id.format and paperformat_id.format != 'custom':
                command_args.extend(['--page-size', paperformat_id.format])

            if paperformat_id.page_height and paperformat_id.page_width and paperformat_id.format == 'custom':
                command_args.extend(['--page-width', str(paperformat_id.page_width) + 'mm'])
                command_args.extend(['--page-height', str(paperformat_id.page_height) + 'mm'])

            if specific_paperformat_args and specific_paperformat_args.get('data-report-margin-top'):
                command_args.extend(['--margin-top', str(specific_paperformat_args['data-report-margin-top'])])
            else:
                command_args.extend(['--margin-top', str(paperformat_id.margin_top)])

            dpi = None
            if specific_paperformat_args and specific_paperformat_args.get('data-report-dpi'):
                dpi = int(specific_paperformat_args['data-report-dpi'])
            elif paperformat_id.dpi:
                if os.name == 'nt' and int(paperformat_id.dpi) <= 95:
                    _logger.info("Generating PDF on Windows platform require DPI >= 96. Using 96 instead.")
                    dpi = 96
                else:
                    dpi = paperformat_id.dpi
            if dpi:
                command_args.extend(['--dpi', str(dpi)])
                if _wkhtml().dpi_zoom_ratio:
                    command_args.extend(['--zoom', str(96.0 / dpi)])

            if specific_paperformat_args and specific_paperformat_args.get('data-report-header-spacing'):
                command_args.extend(['--header-spacing', str(specific_paperformat_args['data-report-header-spacing'])])
            elif paperformat_id.header_spacing:
                command_args.extend(['--header-spacing', str(paperformat_id.header_spacing)])

            command_args.extend(['--margin-left', str(paperformat_id.margin_left)])

            if specific_paperformat_args and specific_paperformat_args.get('data-report-margin-bottom'):
                command_args.extend(['--margin-bottom', str(specific_paperformat_args['data-report-margin-bottom'])])
            else:
                command_args.extend(['--margin-bottom', str(paperformat_id.margin_bottom)])

            command_args.extend(['--margin-right', str(paperformat_id.margin_right)])
            if not landscape and paperformat_id.orientation:
                command_args.extend(['--orientation', str(paperformat_id.orientation)])
            if paperformat_id.header_line:
                command_args.extend(['--header-line'])
            if paperformat_id.disable_shrinking:
                command_args.extend(['--disable-smart-shrinking'])

        # Add extra time to allow the page to render
        delay = self.env['ir.config_parameter'].sudo().get_param('report.print_delay', '1000')
        command_args.extend(['--javascript-delay', delay])

        if landscape:
            command_args.extend(['--orientation', 'landscape'])

        return command_args

    def _prepare_html(self, html, report_model=False):
        '''Divide and recreate the header/footer html by merging all found in html.
        The bodies are extracted and added to a list. Then, extract the specific_paperformat_args.
        The idea is to put all headers/footers together. Then, we will use a javascript trick
        (see minimal_layout template) to set the right header/footer during the processing of wkhtmltopdf.
        This allows the computation of multiple reports in a single call to wkhtmltopdf.
        '''

        # Return empty dictionary if 'web.minimal_layout' not found.
        layout = self._get_layout()
        if not layout:
            return {}
        base_url = self._get_report_url(layout=layout)

        root = lxml.html.fromstring(html, parser=lxml.html.HTMLParser(encoding='utf-8'))
        match_klass = "//div[contains(concat(' ', normalize-space(@class), ' '), ' {} ')]"

        header_node = etree.Element('div', id='minimal_layout_report_headers')
        footer_node = etree.Element('div', id='minimal_layout_report_footers')
        bodies = []
        res_ids = []

        body_parent = root.xpath('//main')[0]
        # Retrieve headers
        for node in root.xpath(match_klass.format('header')):
            body_parent = node.getparent()
            node.getparent().remove(node)
            header_node.append(node)

        # Retrieve footers
        for node in root.xpath(match_klass.format('footer')):
            body_parent = node.getparent()
            node.getparent().remove(node)
            footer_node.append(node)

        # Retrieve bodies
        for node in root.xpath(match_klass.format('article')):
            # set context language to body language
            IrQweb = self.env['ir.qweb']
            if node.get('data-oe-lang'):
                IrQweb = IrQweb.with_context(lang=node.get('data-oe-lang'))
            body = IrQweb._render(layout.id, {
                    'subst': False,
                    'body': Markup(lxml.html.tostring(node, encoding='unicode')),
                    'base_url': base_url,
                    'report_xml_id': self.xml_id,
                    'debug': self.env.context.get("debug"),
                }, raise_if_not_found=False)
            bodies.append(body)
            if node.get('data-oe-model') == report_model:
                res_ids.append(int(node.get('data-oe-id', 0)))
            else:
                res_ids.append(None)

        if not bodies:
            body = ''.join(lxml.html.tostring(c, encoding='unicode') for c in body_parent.getchildren())
            bodies.append(body)

        # Get paperformat arguments set in the root html tag. They are prioritized over
        # paperformat-record arguments.
        specific_paperformat_args = {}
        for attribute in root.items():
            if attribute[0].startswith('data-report-'):
                specific_paperformat_args[attribute[0]] = attribute[1]

        header = self.env['ir.qweb']._render(layout.id, {
            'subst': True,
            'body': Markup(lxml.html.tostring(header_node, encoding='unicode')),
            'base_url': base_url,
            'report_xml_id': self.xml_id,
            'debug': self.env.context.get("debug"),
        })
        footer = self.env['ir.qweb']._render(layout.id, {
            'subst': True,
            'body': Markup(lxml.html.tostring(footer_node, encoding='unicode')),
            'base_url': base_url,
            'report_xml_id': self.xml_id,
            'debug': self.env.context.get("debug"),
        })

        return bodies, res_ids, header, footer, specific_paperformat_args

    def _run_wkhtmltoimage(self, bodies, width, height, image_format="jpg"):
        """
        :bodies str: valid html documents as strings
        :param width int: width in pixels
        :param height int: height in pixels
        :param image_format union['jpg', 'png']: format of the image
        :return list[bytes|None]:
        """
        if (modules.module.current_test or tools.config['test_enable']) and not self.env.context.get('force_image_rendering'):
            return [None] * len(bodies)
        wkhtmltoimage_version = _wkhtml().wkhtmltoimage_version
        if not wkhtmltoimage_version or wkhtmltoimage_version < parse_version('0.12.0'):
            raise UserError(_('wkhtmltoimage 0.12.0^ is required in order to render images from html'))
        command_args = [
            '--disable-local-file-access', '--disable-javascript',
            '--quiet',
            '--width', str(width), '--height', str(height),
            '--format', image_format,
        ]
        with ExitStack() as stack:
            files = []
            for body in bodies:
                input_file = stack.enter_context(tempfile.NamedTemporaryFile(suffix='.html', prefix='report_image_html_input.tmp.'))
                output_file = stack.enter_context(tempfile.NamedTemporaryFile(suffix=f'.{image_format}', prefix='report_image_output.tmp.'))
                input_file.write(body.encode())
                files.append((input_file, output_file))
            output_images = []
            for input_file, output_file in files:
                # smaller bodies may be held in a python buffer until close, force flush
                input_file.flush()
                wkhtmltoimage = [_wkhtml().wkhtmltoimage_bin, *command_args, input_file.name, output_file.name]
                # start and block, no need for parallelism for now
                completed_process = subprocess.run(wkhtmltoimage, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False)
                if completed_process.returncode:
                    message = _(
                        'Wkhtmltoimage failed (error code: %(error_code)s). Message: %(error_message_end)s',
                        error_code=completed_process.returncode,
                        error_message_end=completed_process.stderr[-1000:],
                    )
                    _logger.warning(message)
                    output_images.append(None)
                else:
                    output_images.append(output_file.read())
        return output_images


    @api.model
    def _run_wkhtmltopdf(
            self,
            bodies,
            report_ref=False,
            header=None,
            footer=None,
            landscape=False,
            specific_paperformat_args=None,
            set_viewport_size=False):
        '''Execute wkhtmltopdf as a subprocess in order to convert html given in input into a pdf
        document.

        :param list[str] bodies: The html bodies of the report, one per page.
        :param report_ref: report reference that is needed to get report paperformat.
        :param str header: The html header of the report containing all headers.
        :param str footer: The html footer of the report containing all footers.
        :param landscape: Force the pdf to be rendered under a landscape format.
        :param specific_paperformat_args: dict of prioritized paperformat arguments.
        :param set_viewport_size: Enable a viewport sized '1024x1280' or '1280x1024' depending of landscape arg.
        :return: Content of the pdf as bytes
        :rtype: bytes
        '''
        paperformat_id = self._get_report(report_ref).get_paperformat() if report_ref else self.get_paperformat()

        # Build the base command args for wkhtmltopdf bin
        command_args = self._build_wkhtmltopdf_args(
            paperformat_id,
            landscape,
            specific_paperformat_args=specific_paperformat_args,
            set_viewport_size=set_viewport_size)

        files_command_args = []

        def delete_file(file_path):
            try:
                os.unlink(file_path)
            except OSError:
                _logger.error('Error when trying to remove file %s', file_path)

        with ExitStack() as stack:

            # Passing the cookie to wkhtmltopdf in order to resolve internal links.
            if request and request.db:
                # Create a temporary session which will not create device logs
                temp_session = root.session_store.new()
                temp_session.update({
                    **request.session,
                    'debug': '',
                    '_trace_disable': True,
                })
                if temp_session.uid:
                    temp_session.session_token = security.compute_session_token(temp_session, self.env)
                root.session_store.save(temp_session)
                stack.callback(root.session_store.delete, temp_session)

                base_url = self._get_report_url()
                domain = urlparse(base_url).hostname
                cookie = f'session_id={temp_session.sid}; HttpOnly; domain={domain}; path=/;'
                cookie_jar_file_fd, cookie_jar_file_path = tempfile.mkstemp(suffix='.txt', prefix='report.cookie_jar.tmp.')
                stack.callback(delete_file, cookie_jar_file_path)
                with closing(os.fdopen(cookie_jar_file_fd, 'wb')) as cookie_jar_file:
                    cookie_jar_file.write(cookie.encode())
                command_args.extend(['--cookie-jar', cookie_jar_file_path])

            if header:
                head_file_fd, head_file_path = tempfile.mkstemp(suffix='.html', prefix='report.header.tmp.')
                with closing(os.fdopen(head_file_fd, 'wb')) as head_file:
                    head_file.write(header.encode())
                stack.callback(delete_file, head_file_path)
                files_command_args.extend(['--header-html', head_file_path])
            if footer:
                foot_file_fd, foot_file_path = tempfile.mkstemp(suffix='.html', prefix='report.footer.tmp.')
                with closing(os.fdopen(foot_file_fd, 'wb')) as foot_file:
                    foot_file.write(footer.encode())
                stack.callback(delete_file, foot_file_path)
                files_command_args.extend(['--footer-html', foot_file_path])

            paths = []
            for i, body in enumerate(bodies):
                prefix = '%s%d.' % ('report.body.tmp.', i)
                body_file_fd, body_file_path = tempfile.mkstemp(suffix='.html', prefix=prefix)
                with closing(os.fdopen(body_file_fd, 'wb')) as body_file:
                    # HACK: wkhtmltopdf doesn't like big table at all and the
                    #       processing time become exponential with the number
                    #       of rows (like 1H for 250k rows).
                    #
                    #       So we split the table into multiple tables containing
                    #       500 rows each. This reduce the processing time to 1min
                    #       for 250k rows. The number 500 was taken from opw-1689673
                    if len(body) < 4 * 1024 * 1024:  # 4Mib
                        body_file.write(body.encode())
                    else:
                        tree = lxml.html.fromstring(body)
                        _split_table(tree, 500)
                        body_file.write(lxml.html.tostring(tree))
                paths.append(body_file_path)
                stack.callback(delete_file, body_file_path)

            pdf_report_fd, pdf_report_path = tempfile.mkstemp(suffix='.pdf', prefix='report.tmp.')
            os.close(pdf_report_fd)
            stack.callback(delete_file, pdf_report_path)

            process = _run_wkhtmltopdf(command_args + files_command_args + paths + [pdf_report_path])
            err = process.stderr

            match process.returncode:
                case 0:
                    pass
                case 1:
                    if len(bodies) > 1:
                        wk_version = _wkhtml().version
                        if '(with patched qt)' not in wk_version:
                            if modules.module.current_test:
                                raise unittest.SkipTest("Unable to convert multiple documents via wkhtmltopdf using unpatched QT")
                            raise UserError(_("Tried to convert multiple documents in wkhtmltopdf using unpatched QT"))

                    _logger.warning("wkhtmltopdf: %s", err)
                case c:
                    message = _(
                        'Wkhtmltopdf failed (error code: %(error_code)s). Memory limit too low or maximum file number of subprocess reached. Message : %(message)s',
                        error_code=c,
                        message=err[-1000:],
                    ) if c == -11 else _(
                        'Wkhtmltopdf failed (error code: %(error_code)s). Message: %(message)s',
                        error_code=c,
                        message=err[-1000:],
                    )
                    _logger.warning(message)
                    raise UserError(message)

            with open(pdf_report_path, 'rb') as pdf_document:
                pdf_content = pdf_document.read()

        return pdf_content

    def _render_qweb_pdf_prepare_streams_wkhtmltopdf(
        self, report_ref, data, res_ids=None
    ):
        data = self._initialize_pdf_data(data)
        report_sudo = self._get_report(report_ref)
        has_duplicated_ids = res_ids and len(res_ids) != len(set(res_ids))
        collected_streams = self._collect_existing_streams(
            report_ref=report_ref,
            res_ids=res_ids,
        )

        res_ids_wo_stream = [res_id for res_id, s in collected_streams.items() if not s['stream']]
        all_streams_ready = res_ids and not res_ids_wo_stream
        if all_streams_ready:
            return collected_streams

        if self.get_wkhtmltopdf_state() == 'install':
            # wkhtmltopdf is not installed
            # the call should be catched before (cf /report/get_pdf_engine_state) but
            # if get_pdf is called manually (email template), the check could be
            # bypassed
            raise UserError(_("Unable to find Wkhtmltopdf on this system. The PDF can not be created."))
        doc_ids = res_ids if has_duplicated_ids else res_ids_wo_stream 
        html = self.with_context(debug=False)._render_qweb_html(report_ref, doc_ids, data=data)[0]
        bodies, html_ids, header, footer, specific_paperformat_args = report_sudo.with_context(debug=False)._prepare_html(html, report_model=report_sudo.model)

        if not has_duplicated_ids and report_sudo.attachment and set(res_ids_wo_stream) != set(html_ids):
            raise UserError(_(
                "Report template “%s” has an issue, please contact your administrator. \n\n"
                "Cannot separate file to save as attachment because the report's template does not contain the"
                " attributes 'data-oe-model' and 'data-oe-id' as part of the div with 'article' classname.",
                report_sudo.name,
            ))

        pdf_content = self._run_wkhtmltopdf(
            bodies,
            report_ref=report_ref,
            header=header,
            footer=footer,
            landscape=self.env.context.get('landscape'),
            specific_paperformat_args=specific_paperformat_args,
            set_viewport_size=self.env.context.get('set_viewport_size'),
        )
        pdf_content_stream = io.BytesIO(pdf_content)

        # Printing a PDF report without any records. The content could be returned directly.
        if has_duplicated_ids or not res_ids:
            return {
                False: {
                    'stream': pdf_content_stream,
                    'attachment': None,
                }
            }

        # Split the pdf for each record using the PDF outlines.

        # Only one record: append the whole PDF.
        if len(res_ids_wo_stream) == 1:
            collected_streams[res_ids_wo_stream[0]]['stream'] = pdf_content_stream
            return collected_streams

        # In case of multiple docs, we need to split the pdf according the records.
        # In the simplest case of 1 res_id == 1 page, we use the PDFReader to print the
        # pages one by one.
        html_ids_wo_none = [x for x in html_ids if x]
        reader = PdfFileReader(pdf_content_stream)
        if reader.numPages == len(res_ids_wo_stream):
            for i in range(reader.numPages):
                attachment_writer = PdfFileWriter()
                attachment_writer.addPage(reader.getPage(i))
                stream = io.BytesIO()
                attachment_writer.write(stream)
                collected_streams[res_ids_wo_stream[i]]['stream'] = stream
            return collected_streams

        # In cases where the number of res_ids != the number of pages,
        # we split the pdf based on top outlines computed by wkhtmltopdf.
        # An outline is a <h?> html tag found on the document. To retrieve this table,
        # we look on the pdf structure using pypdf to compute the outlines_pages from
        # the top level heading in /Outlines.
        if len(res_ids_wo_stream) > 1 and set(res_ids_wo_stream) == set(html_ids_wo_none):
            root = reader.trailer['/Root']
            has_valid_outlines = '/Outlines' in root and '/First' in root['/Outlines']
            if not has_valid_outlines:
                return {False: {
                    'report_action': self,
                    'stream': pdf_content_stream,
                    'attachment': None,
                }}

            outlines_pages = []
            node = root['/Outlines']['/First']
            while True:
                outlines_pages.append(root['/Dests'][node['/Dest']][0])
                if '/Next' not in node:
                    break
                node = node['/Next']
            outlines_pages = sorted(set(outlines_pages))

            # The number of outlines must be equal to the number of records to be able to split the document.
            has_same_number_of_outlines = len(outlines_pages) == len(res_ids_wo_stream)

            # There should be a top-level heading on first page
            has_top_level_heading = outlines_pages[0] == 0

            if has_same_number_of_outlines and has_top_level_heading:
                # Split the PDF according to outlines.
                for i, num in enumerate(outlines_pages):
                    to = outlines_pages[i + 1] if i + 1 < len(outlines_pages) else reader.numPages
                    attachment_writer = PdfFileWriter()
                    for j in range(num, to):
                        attachment_writer.addPage(reader.getPage(j))
                    stream = io.BytesIO()
                    attachment_writer.write(stream)
                    collected_streams[res_ids_wo_stream[i]]['stream'] = stream

                return collected_streams

        collected_streams[False] = {'stream': pdf_content_stream, 'attachment': None}
        return collected_streams

    @api.model
    def _get_direct_rendering_engines(self):
        engines = super()._get_direct_rendering_engines()
        engines['qweb-pdf-wkhtml'] = self._run_wkhtmltopdf
        return engines

    @api.model
    def _get_rendering_engines(self):
        engines = super()._get_rendering_engines()
        engines['qweb-pdf-wkhtml'] = self._render_qweb_pdf_prepare_streams_wkhtmltopdf
        return engines
