from odoo import models, _
from odoo.exceptions import ValidationError


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    def _render_qweb_pdf(self, report_ref, res_ids=None, data=None):
        if self.env.context.get('default_is_template', False):
            raise ValidationError(_('This action cannot be performed on task templates'))
        return super()._render_qweb_pdf(report_ref, res_ids=res_ids, data=data)
