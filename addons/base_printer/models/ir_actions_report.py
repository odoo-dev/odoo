
import base64

from odoo import fields, models, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools import format_amount


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    is_printer_linked = fields.Boolean(string="Enable Printer Linkage")
    linked_printer_ids = fields.Many2many("report.printer", string="Linked Printers")

    def render_and_send_email(self, active_record_ids, data=None):
        datas = self._render(self.report_name, active_record_ids, data)
        data_bytes = datas[0]
        data_base64 = base64.b64encode(data_bytes)

        attachment = self.env['ir.attachment'].create({
                'name': self.name + '.pdf',
                'type': 'binary',
                'datas': data_base64,
                'mimetype': 'application/pdf'
            })

        mail_template_id = 'base_printer.mail_template_print_attachment'
        mail_template = self.env.ref(mail_template_id, raise_if_not_found=False)
        if not mail_template:
            raise UserError(_("The mail template with xmlid %s not found.", mail_template_id))
        mail_template.send_mail_batch(self.linked_printer_ids.ids, force_send=True, email_values={'attachment_ids': attachment.ids})

    def report_action(self, docids, data=None, config=True):
        result = super().report_action(docids, data, config)
        if result.get('type') != 'ir.actions.report':
            return result
        result['id'] = self.id
        result['is_printer_linked'] = self.is_printer_linked
        return result

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "id", "is_printer_linked",
        }

    def get_linked_printers(self):
        printer_ids = self.linked_printer_ids
        printer_list = []
        for printer_id in printer_ids:
            printer_list.append({
                "id": printer_id.id,
                "name": printer_id.name,
                "printer_mode": printer_id.printer_mode,
                "printer_email": printer_id.printer_email,
                "printer_ip": printer_id.printer_ip,
            })
        return printer_list

    def _get_ip_supported_report_names(self):
        return [
            "product.report_producttemplatelabel_dymo",
            "product.report_producttemplatelabel2x7",
            "product.report_producttemplatelabel4x7",
            "product.report_producttemplatelabel4x12",
            "product.report_producttemplatelabel4x12noprice",
        ]

    def write(self, vals):
        res = super().write(vals)
        for record in self:
            if vals.get("report_name", record.report_name) not in self._get_ip_supported_report_names() and vals.get("is_printer_linked", record.is_printer_linked):
                if any(p.printer_mode == "ip" for p in record.linked_printer_ids):
                    raise ValidationError(
                        _("You cannot link an IP-mode printer to a report that is not a supported label print.")
                    )
        return res

    def get_product_data(self, model, product_ids, pricelist_id):
        products = self.env[model].browse(product_ids)
        return {
            'products': [{
                'name': product.name,
                'barcode': product.barcode,
                'price': format_amount(self.env, (product.list_price if model == 'product.template' else product.lst_price) if not pricelist_id else pricelist_id._get_product_price(product, 1.0, uom=product.uom_id), self.env.company.currency_id),
                'default_code': product.default_code,
            } for product in products]
        }
