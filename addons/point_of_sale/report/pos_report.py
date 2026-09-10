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
        return {
            'id': report.id,
            'name': report.name,
            'filters': handler._get_filters(),
        }

    @api.model
    def get_report_data(self, report_id, options=None):
        report = self.browse(report_id)
        handler = report._get_handler()
        currency = handler._get_currency(options)
        return {
            'sections': handler._get_sections_data(options or {}),
            'currency': {
                'id': currency.id,
                'symbol': currency.symbol,
                'position': currency.position,
                'decimal_places': currency.decimal_places,
            },
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

    def _format_tree_values(self, nodes, columns, currency):
        """Format values recursively while preserving the existing report tree structure."""
        for node in nodes:
            node_columns = node.get('columns') or columns
            col_types = {
                col.get('id'): col.get('type', 'string')
                for col in node_columns if col.get('id')
            }

            line_values = node.get('values') or {}
            node['values'] = {
                col_id: self._format_value(raw, col_types[col_id], currency)
                for col_id, raw in line_values.items()
                if col_id in col_types
            }

            self._format_tree_values(node.get('lines') or [], node_columns, currency)

    def _format_value(self, value, col_type, currency=None):
        """Format a value to display according to its column type."""
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
        """Build readable filter descriptions from options."""
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
        """Generate the POS report as a PDF using the handler-generated report data."""
        self.ensure_one()
        handler = self._get_handler()
        currency = handler._get_currency(options)

        data = handler._get_sections_data({**(options or {}), 'unfold_all': True})
        self._format_tree_values(data, [], currency)

        rcontext = {
            'company': self.env.company,
            'report_name': self.name,
            'generation_date': format_date(self.env, datetime.now()),
            'filters': self._get_filter_descriptions(options, handler),
            'sections': data,
            'currency': currency,
        }

        action_report = self.env['ir.actions.report']
        html = action_report._render_template(
            'point_of_sale.pos_report_pdf_main',
            rcontext,
        ).decode()

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
