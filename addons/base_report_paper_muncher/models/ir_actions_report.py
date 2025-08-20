# Part of Odoo. See LICENSE file for full copyright and licensing details.

import io
import lxml.html
from collections import defaultdict
from lxml import etree
from markupsafe import Markup

from odoo import models, fields, api, _
from odoo.addons.base_report_paper_muncher.engine import can_use_paper_muncher, rendered
from odoo.addons.base_report_paper_muncher.engine.utils.html import patch_html_etree

import fitz
def fix_with_pymupdf(broken_pdf_bytes: bytes) -> bytes:
    doc = fitz.open(stream=broken_pdf_bytes, filetype="pdf")
    output = io.BytesIO()
    doc.save(output)
    return io.BytesIO(output.getvalue())

REPORT_HEADER_ID = 'minimal_layout_report_headers'
REPORT_FOOTER_ID = 'minimal_layout_report_footers'


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    report_type = fields.Selection(
        selection_add=[
            ('qweb-pdf-paper-muncher', 'QWeb PDF (Paper Muncher)'),
        ],
        ondelete={
            'qweb-pdf-paper-muncher': 'set default',
        }
    )

    def _get_pdf_engine_state(self, engine):
        """Return the state of the PDF engine for this report."""
        if engine != 'qweb-pdf-paper-muncher':
            return super()._get_pdf_engine_state(engine)
        if can_use_paper_muncher():
            return 'ok', _('Paper Muncher is ready to use.')
        return 'broken', _('Paper Muncher is not available or usable.')

    def _pm_prepare_html(self, html, report_ref=False):
        layout = self._get_layout()
        report_model = self._get_report(report_ref).model
        if not layout:
            return defaultdict(list), {}
        base_url = self._get_report_url(layout=layout)

        root = lxml.html.fromstring(html, parser=lxml.html.HTMLParser(encoding='utf-8'))
        match_css_class = "//div[contains(concat(' ', normalize-space(@class), ' '), ' {} ')]"
        IrQweb = self.env['ir.qweb']
        header_node = etree.Element('div', id=REPORT_HEADER_ID)
        footer_node = etree.Element('div', id=REPORT_FOOTER_ID)
        documents_by_html_id= defaultdict(list)

        body_parent = root.xpath('//main')[0]
        # Retrieve headers
        for node in root.xpath(match_css_class.format('header')):
            body_parent = node.getparent()
            node.getparent().remove(node)
            header_node.append(node)

        # Retrieve footers
        for node in root.xpath(match_css_class.format('footer')):
            body_parent = node.getparent()
            node.getparent().remove(node)
            footer_node.append(node)

        # Retrieve bodies
        for node in root.xpath(match_css_class.format('article')):
            if node.get('data-oe-lang'):
                IrQweb = IrQweb.with_context(lang=node.get('data-oe-lang'))
            body = IrQweb._render(layout.id, {
                    'subst': False,
                    'body': Markup(lxml.html.tostring(node, encoding='unicode')),
                    'base_url': base_url,
                    'report_xml_id': self.xml_id,
                    'debug': self.env.context.get("debug"),
                }, raise_if_not_found=False)
            if node.get('data-oe-model') == report_model:
                documents_by_html_id[int(node.get('data-oe-id', 0))].append(body)
            else:
                documents_by_html_id[None].append(body)

        if not documents_by_html_id:
            body = ''.join(lxml.html.tostring(c, encoding='unicode') for c in body_parent.getchildren())
            documents_by_html_id[None].append(body)

        # Get paperformat arguments set in the root html tag. They are prioritized over
        # paperformat-record arguments.
        specific_paperformat_args = {}
        for attribute in root.items():
            if attribute[0].startswith('data-report-'):
                specific_paperformat_args[attribute[0]] = attribute[1]

        return documents_by_html_id, specific_paperformat_args

    def _pm_reconcile_collected_streams(
        self,
        mutable_stream_dict,
        *args,
    ):
        for stream_dict in args:
            for document_id, stream_data in stream_dict.items():
                if document_id not in mutable_stream_dict:
                    mutable_stream_dict[document_id] = stream_data
                    continue
                mutable_stream_dict[document_id].update(stream_data)
        return mutable_stream_dict


    def prepare_paper_muncher_args(self, specific_paperformat_args=None):
        return {}

    def post_process_pm_pdf_stream(self, pdf_stream, document_id, documents_by_html_id):
        return ''

    def _run_paper_muncher(self, reports, mode='print'):
        self.ensure_one()
        if not can_use_paper_muncher():
            raise ValueError("Paper Muncher is not available or usable.")
        additional_context = dict(debug=False)
        html = self.with_context(**additional_context)._render_qweb_html(report_ref, res_ids, data=data)[0]
        documents_by_html_id, specific_paperformat_args = self._prepare_pm_html(
            html, report_model=self._get_report_model())

        for document_id, documents in documents_by_html_id.items():
            for document in documents:
                with rendered(
                    paperformat_id=self.paperformat_id,
                    content=document.encode('utf-8'),
                    mode=mode,
                    **self.prepare_paper_muncher_args(specific_paperformat_args),
                ) as (file_stream, _unused_stream):
                    if mode == 'print':
                        pdf_file = self.post_process_pm_pdf_stream(
                            file_stream, document_id, documents_by_html_id)

    def _render_qweb_pdf_prepare_streams_paper_muncher(
        self, report_ref, data, res_ids=None
    ):

        collected_streams = self._collect_existing_streams(
            report_ref=report_ref,
            res_ids=res_ids,
        )
        res_ids_wo_stream = [
            res_id for res_id, s
            in collected_streams.items()
            if not s['stream']
        ]
        if res_ids and not res_ids_wo_stream:  # all streams are already collected
            return collected_streams

        if not can_use_paper_muncher():
            raise ValueError("Paper Muncher is not available or usable.")

        additional_context = dict(debug=False)
        html = self.with_context(**additional_context)._render_qweb_html(
            report_ref,
            res_ids,
            data=self._initialize_pdf_data(data)
        )[0]
        documents_by_html_id, specific_paperformat_args = self._pm_prepare_html(
            html, report_ref=report_ref)

        file_streams = {}
        for document_id, documents in documents_by_html_id.items():
            for document in documents:
                with rendered(
                    paperformat=self.paperformat_id,
                    content=document,
                    mode='print',
                    **self.prepare_paper_muncher_args(specific_paperformat_args),
                ) as (file_stream, _unused_stream):
                    bytes_stream = io.BytesIO(file_stream.read())
                    file_streams[document_id] = {
                        'stream': bytes_stream,
                        'attachment': None
                    }

        return self._pm_reconcile_collected_streams(
            collected_streams,
            file_streams,
        )

    @api.model
    def _get_direct_rendering_engines(self):
        engines = super()._get_direct_rendering_engines()
        engines['qweb-pdf-paper-muncher'] = self._run_paper_muncher
        return engines

    @api.model
    def _get_rendering_engines(self):
        engines = super()._get_rendering_engines()
        engines['qweb-pdf-paper-muncher'] = self._render_qweb_pdf_prepare_streams_paper_muncher
        return engines
