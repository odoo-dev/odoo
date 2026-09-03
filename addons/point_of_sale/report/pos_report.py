from datetime import datetime
from typing import TYPE_CHECKING

import markupsafe

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import format_date, formatLang

if TYPE_CHECKING:
    from .pos_report_handler import PosReportHandler


class PosReport(models.Model):
    _name = 'pos.report'
    _description = 'POS Report'

    name = fields.Char(required=True)
    handler_model_id = fields.Many2one('ir.model', string='Handler Model')
    handler_model_name = fields.Char(related='handler_model_id.model', string='Handler Model Name')

    def _get_handler(self) -> "PosReportHandler":
        self.ensure_one()
        if not self.handler_model_name:
            raise UserError(_("No report handler configured for '%s'.", self.name))
        return self.env[self.handler_model_name]

    @api.model
    def get_report_info(self, report_id):
        report = self.browse(report_id)
        handler = report._get_handler()
        currency = self.env.company.currency_id
        return {
            'id': report.id,
            'name': report.name,
            'currency': {
                'id': currency.id,
                'symbol': currency.symbol,
                'position': currency.position,
                'decimal_places': currency.decimal_places,
            },
            'filters': handler._get_filters(),
        }

    @api.model
    def get_report_data(self, report_id, options=None):
        report = self.browse(report_id)
        handler = report._get_handler()
        return {
            'sections': handler._get_sections_data(options or {}),
        }

    @api.model
    def get_unfold_data(self, report_id, section_id, record_id=None, options=None):
        """Return children lines for a given section / record combination"""
        report = self.browse(report_id)
        handler = report._get_handler()
        return {
            'section_id': section_id,
            'record_id': record_id,
            'lines': handler._get_unfold_lines(section_id, record_id, options or {}),
        }
    
    def _build_full_tree(self, handler, options):
        """Build the complete hierarchical report tree from all sections"""
        sections_meta = handler._get_sections_meta()
        result = []

        for meta in sections_meta:
            section_data = self._build_section_data(handler, meta, options)
            if section_data:
                result.append(section_data)

        return result

    def _build_section_data(self, handler, meta, options):
        """Build the complete nested data for one section"""
        section_id = meta['id']
        columns = meta.get('columns', [])

        # Get the root line for this section
        root_lines = self._get_root_lines_for_section(handler, meta, options)
        if not root_lines:
            return None

        root = root_lines[0] if isinstance(root_lines, list) else root_lines
        currency = self.env.company.currency_id

        section_node = {
            'name': meta.get('name', ''),
            'section_id': section_id,
            'columns': columns,
            'values': self._extract_formatted_values(root, columns, currency),
            'level': root.get('level', 0),
            'style': root.get('style', 'normal'),
            'lines': [],
        }

        # Unfold children recursively
        children = handler._get_unfold_lines(section_id, None, options)
        if children:
            section_node['lines'] = self._build_child_tree(
                handler, children, options, columns, currency,
            )

        return section_node

    def _get_root_lines_for_section(self, handler, meta, options):
        """Get the root-level line(s) for a section.

        Root section methods receive only ``options`` (no unfold_context).
        """
        section_id = meta['id']
        for fn in handler._get_section_methods():
            if fn._rs_id == section_id:
                lines = fn(handler, options)
                normalized = handler._normalize_lines(fn, lines)
                return normalized or None
        return None

    def _build_child_tree(self, handler, flat_lines, options, columns, currency, visited=None):
        """Convert flat child lines into a nested tree, formatting values.

        Children share the parent's column definitions for formatting.
        Recursively unfolds grandchildren.
        """
        if visited is None:
            visited = set()

        tree = []
        for line in flat_lines:
            section_id = line.get('section_id')
            foldability = line.get('foldability', 'static')
            record_id = line.get('record_id')

            node = {
                'name': line.get('name', ''),
                'level': line.get('level', 0),
                'style': line.get('style', 'normal'),
                'values': self._extract_formatted_values(line, columns, currency),
                'lines': [],
            }

            # Recurse if this line can be unfolded and has child sections
            if foldability != 'static' and section_id:
                child_sections = handler._get_section_methods(section_id)
                if child_sections:
                    key = (section_id, record_id)
                    if key not in visited:
                        visited.add(key)
                        try:
                            child_lines = handler._get_unfold_lines(
                                section_id, record_id, options,
                            )
                            if child_lines:
                                node['lines'] = self._build_child_tree(
                                    handler, child_lines, options,
                                    columns, currency, visited,
                                )
                        except Exception:
                            node['lines'] = []

            tree.append(node)
        return tree

    def _extract_formatted_values(self, line, columns, currency):
        """Extract and format column values according to column types.

        :param line: dict from a section method (raw values)
        :param columns: list of column definitions [{id, label, type, align}]
        :param currency: res.currency record for monetary formatting
        :returns: dict {col_id: formatted_string}
        """
        values = {}
        if not line or not columns:
            return values

        line_values = line.get('values', {})
        for col in columns or []:
            col_id = col.get('id')
            if col_id and col_id in line_values:
                raw = line_values[col_id]
                if raw is not None:
                    values[col_id] = self._format_value(
                        raw, col.get('type', 'string'), currency,
                    )
                else:
                    values[col_id] = ''
        return values

    def _format_value(self, value, col_type, currency=None):
        """Format a value for PDF display according to its column type.

        Matches the frontend formatting from ``TreeNode.getFormattedValue()``.
        """
        if value is None:
            return ''

        if col_type == 'monetary':
            curr = currency or self.env.company.currency_id
            return formatLang(self.env, value, currency_obj=curr)

        elif col_type == 'integer':
            return formatLang(self.env, int(value), digits=0)

        elif col_type == 'float':
            curr = currency or self.env.company.currency_id
            return formatLang(self.env, value, digits=curr.decimal_places)

        elif col_type == 'percentage':
            return f"{formatLang(self.env, value, digits=2)}%"

        else:
            return str(value)

    def _get_filter_descriptions(self, options, handler):
        """Build human-readable filter descriptions from options."""
        descriptions = []

        if options.get('date_from'):
            descriptions.append({
                'label': _('From'),
                'value': options['date_from'],
            })
        if options.get('date_to'):
            descriptions.append({
                'label': _('To'),
                'value': options['date_to'],
            })

        config_ids = options.get('config_ids', [])
        if config_ids:
            configs = self.env['pos.config'].browse(config_ids)
            descriptions.append({
                'label': _('POS'),
                'value': ', '.join(configs.mapped('name')),
            })

        session_ids = options.get('session_ids', [])
        if session_ids:
            sessions = self.env['pos.session'].browse(session_ids)
            descriptions.append({
                'label': _('Sessions'),
                'value': ', '.join(sessions.mapped('name')),
            })

        return descriptions

    def export_to_pdf(self, options):
        """Generate a PDF for the POS report.

        Follows the Account Reports architecture:
        - Self-contained HTML document with <header> (company info + title + filters)
        - Real <table> elements for data sections
        - wkhtmltopdf --footer-html via ``web.internal_layout`` for page footers

        :param dict options: Report options (filters, date range, etc.)
        :returns: dict with ``file_name``, ``file_content``, ``file_type``
        """
        self.ensure_one()
        handler = self._get_handler()
        sections_meta = handler._get_sections_meta()

        report_sections = []
        for meta in sections_meta:
            section_data = self._build_section_data(handler, meta, options)
            if section_data:
                report_sections.append(section_data)

        company = self.env.company

        rcontext = {
            'company': company,
            'report_name': self.name,
            'generation_date': format_date(self.env, datetime.now()),
            'filters': self._get_filter_descriptions(options, handler),
            'sections': report_sections,
            'currency': company.currency_id,
        }

        # Render the self-contained HTML document.
        action_report = self.env['ir.actions.report']
        html = action_report._render_template(
            'point_of_sale.pos_report_pdf_main',
            rcontext,
        ).decode()

        # Generate PDF via wkhtmltopdf using the standard engine API.
        pdf_bytes = action_report._run_pdf_engine_without_processing(
            'wkhtmltopdf',
            [html],
            report_ref=False,
            header=None,
            footer=None,
            landscape=False,
            specific_paperformat_args={
                'data-report-margin-top': 10,
                'data-report-header-spacing': 10,
                'data-report-margin-bottom': 15,
            },
        )

        return {
            'file_name': f"{self.name}.pdf",
            'file_content': pdf_bytes,
            'file_type': 'pdf',
        }

    def _get_pdf_footer(self, rcontext):
        """Render the PDF page footer using ``web.internal_layout``.

        Follows the Account Reports pattern: render the layout template,
        then wrap it in ``web.minimal_layout`` with ``subst=True`` so
        wkhtmltopdf can inject page numbers.
        """
        footer_html = self.env['ir.actions.report']._render_template(
            'web.internal_layout', values=rcontext,
        )
        footer_html = self.env['ir.actions.report']._render_template(
            'web.minimal_layout',
            values=dict(
                rcontext,
                subst=True,
                body=markupsafe.Markup(footer_html.decode()),
            ),
        )
        return footer_html.decode()
