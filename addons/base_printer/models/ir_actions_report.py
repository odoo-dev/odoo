# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import re

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    linked_printer_ids = fields.Many2many("report.printer", string="Linked Printers")

    def render_and_send_email(self, active_record_ids, data, selected_device_ids):
        """
        Generate a PDF report and send it via email to the configured printer address
        """
        self.ensure_one()
        datas = self._render(self.report_name, active_record_ids, data)
        attachment = self.env['ir.attachment'].create({
            'name': f"{self.name}.pdf",
            'type': 'binary',
            'datas': base64.b64encode(datas[0]),
            'mimetype': 'application/pdf',
        })

        mail_template = self.env.ref('base_printer.mail_template_print_attachment', raise_if_not_found=False)
        if not mail_template:
            raise UserError(_("The mail template with XML ID '%s' was not found.", 'base_printer.mail_template_print_attachment'))

        email_printers = self.linked_printer_ids.filtered(
            lambda printer: printer.id in selected_device_ids
        )
        mail_template.send_mail_batch(email_printers.ids, force_send=True, email_values={'attachment_ids': attachment.ids})
        return email_printers.read(['id', 'name'])

    def report_action(self, docids, data=None, config=True):
        result = super().report_action(docids, data, config)
        if result.get('type') != 'ir.actions.report':
            return result
        result.update({"id": self.id, "linked_printer_ids": self.linked_printer_ids.read(['name'])})
        return result

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {"id", "linked_printer_ids"}
