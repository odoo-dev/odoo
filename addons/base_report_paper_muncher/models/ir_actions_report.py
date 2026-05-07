# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import lxml
import os
import subprocess
from collections.abc import Sequence
from typing import Literal

from odoo import _, api, fields, models

from ..paper_muncher import Server, which_paper_muncher

_logger = logging.getLogger(__name__)

class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'
    _description = 'Report Action'

    report_type = fields.Selection(
        selection_add=[('qweb-pdf-paper-muncher', 'PDF (Paper Muncher)')],
        default='qweb-pdf',
        ondelete={'qweb-pdf-paper-muncher': 'set qweb-pdf'},
    )

    @api.model
    def get_pdf_engine_state(self, engine_name=None):
        if engine_name is None:
            if self.report_type.startswith('qweb-pdf-paper-muncher'):
                engine_name = 'paper-muncher'
        if engine_name == 'paper-muncher':
            try:
                which_paper_muncher()
            except RuntimeError:
                return 'install'
            else:
                return 'ok'
        return super().get_pdf_engine_state(engine_name)

    @api.model
    def _run_paper_muncher(
        self,
        bodies: Sequence[str],
        report_ref: str | Literal[False] = False,
        header: str = '',
        footer: str = '',
        landscape: bool = False,
        scale: int = 72,
    ) -> bytes:
        """Render a PDF from HTML content using Paper Muncher subprocess.

        :param bodies: List of HTML body strings.
        :param report_ref: report reference that is needed to get report paperformat.
        :param header: HTML header fragment.
        :param footer: HTML footer fragment.
        :param landscape: Whether to use landscape layout.
        :param scale: document scale (DPI)
        :returns: PDF bytes returned by Paper Muncher.
        :raises RuntimeError: If Paper Muncher fails during any phase.
        """
        paperformat = self._get_report(report_ref).get_paperformat() if report_ref else self.get_paperformat()

        if not isinstance(bodies, (list, tuple)):
            bodies = list(bodies)

        if len(bodies) > 1:
            documents = make_multi_docs_html(bodies, header, footer)
        else:
            header = partition_on_body(header)[1]
            footer = partition_on_body(footer)[1]
            open_body, body, close_body = partition_on_body(bodies[0])
            documents = [f'{open_body}{header}{body}{footer}{close_body}\n']

        names = [f'pipe:{i}.html' for i in range(len(documents))]
        extra_args = [
            '--scale', f'{scale}dpi',
            '--margins', 'none',
        ]
        if landscape:
            extra_args += ['--orientation', 'landscape']
        if os.getenv('ODOO_PAPER_MUNCHER_FEATURE') == '1':
            extra_args += ['--feature', '*=on']  # activate all experimental/optional features
        if paperformat and paperformat.format:
            if paperformat.format != 'custom':
                extra_args += ['--paper', str(paperformat.format)]
            elif paperformat.page_height and paperformat.page_width:
                extra_args += ['--width', f'{paperformat.page_width}mm']
                extra_args += ['--height', f'{paperformat.page_height}mm']

        env = os.environ.copy()
        # Disable ANSI color codes in subprocess logs to prevent parsing errors.
        env['NO_COLOR'] = '1'

        with subprocess.Popen(
                [which_paper_muncher(), *names, '-o', 'pipe:', *extra_args],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
        ) as process:
            server = Server(process)
            return server.serve(documents)


    def _run_pdf_engine_without_processing(
            self,
            engine_name,
            bodies,
            report_ref=False,
            *,
            header=None,
            footer=None,
            landscape=False,
            specific_paperformat_args=None,
            scale: int = 72,
            **kwargs,
    ) -> bytes:
        if engine_name == 'paper-muncher':
            return self._run_paper_muncher(
                bodies,
                report_ref=report_ref,
                header=header,
                footer=footer,
                landscape=landscape,
                specific_paperformat_args=specific_paperformat_args,
                set_viewport_size=set_viewport_size,
                scale=scale,
            )
        return super()._run_pdf_engine_without_processing(
            engine_name, bodies, report_ref, header, footer, landscape,
            specific_paperformat_args, set_viewport_size)

    def _run_pdf_engine(
        self,
        engine_name: str,
        html: str,
        report_ref: str | bool = False,
        landscape: bool = False,
        **kwargs,
    ) -> tuple[bytes, list[int]]:
        if engine_name == 'paper-muncher':
            report_sudo = self._get_report(report_ref).with_context(debug=False)
            bodies, html_ids, header, footer, specific_paperformat_args = (
                report_sudo._prepare_wkhtmltopdf_html(html, report_model=report_sudo.model))
            content = self._run_paper_muncher(
                bodies,
                report_ref=report_ref,
                header=header,
                footer=footer,
                landscape=landscape,
                specific_paperformat_args=specific_paperformat_args,
                scale=kwargs.get('dpi-resolution', 72),
            )
            return content, html_ids
        return super()._run_pdf_engine(engine_name, html, report_ref, landscape, **kwargs)


def partition_on_body(html: str) -> tuple[str, str, str]:
    """
    Get what's before the body, the body and what's after the body.
    When no ``<body>`` was found, it returns ``(html, "", "")``.
    """
    pre_body, body_tag, body = html.partition('<body>')
    if not body_tag:
        return html, '', ''
    body, body_end_tag, post_body = body.rpartition('</body>')
    return pre_body + body_tag, body, body_end_tag + post_body


def make_multi_docs_html(bodies: Sequence[str], header: str = '', footer: str = '') -> Sequence[str]:
    """Inject per-page header/footer fragments into each body HTML document."""

    footers = [
        lxml.etree.tostring(footer, encoding='unicode')
        for footer in lxml.html.fromstring(
            partition_on_body(footer)[1],
        ).findall('./div')
    ]

    headers = [
        lxml.etree.tostring(header, encoding='unicode')
        for header in lxml.html.fromstring(
            partition_on_body(header)[1],
        ).findall('./div')
    ]

    is_same_length_header = (len(headers) == len(bodies))
    if headers and not is_same_length_header:
        _logger.warning(
            "Header fragments count (%d) does not match body count (%d); reusing the first header fragment where needed.",
            len(headers),
            len(bodies),
        )

    is_same_length_footer = (len(footers) == len(bodies))
    if footers and not is_same_length_footer:
        _logger.warning(
            "Footer fragments count (%d) does not match body count (%d); reusing the first footer fragment where needed.",
            len(footers),
            len(bodies),
        )

    documents = []
    for i, body in enumerate(bodies):
        pre_body, body, post_body = partition_on_body(body)
        header_fragment = headers[i] if is_same_length_header else (headers[0] if headers else '')
        footer_fragment = footers[i] if is_same_length_footer else (footers[0] if footers else '')
        documents.append(f'{pre_body}{header_fragment}{body}{footer_fragment}{post_body}\n')

    return documents
