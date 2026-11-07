from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    _base__paperformat_euro = models.Ref('base.paperformat_euro', 'report.paperformat')

    def get_paperformat(self):
        paper_format = super().get_paperformat()
        din5008_formats = self.env['report.paperformat'].search([('name', 'ilike', '%din5008%')])
        if self.env.context.get('account_report_pdf_export') and paper_format in din5008_formats:
            return self._base__paperformat_euro
        return paper_format

    def _get_rendering_context(self, report, docids, data):
        data = super()._get_rendering_context(report, docids, data)
        data['din_header_spacing'] = report.get_paperformat().header_spacing
        return data
