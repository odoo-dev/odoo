import base64

from odoo import _, fields, models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    printer_ids = fields.Many2many(
        'printers.printer',
        'report_printer_rel',
        'report_id',
        'printer_id',
        string='Printers',
    )

    def generate_print_data(self, printer_ids, res_ids, data=None):
        self.ensure_one()
        printers = self.env['printers.printer'].browse(printer_ids)
        content_bytes, _ = self._render(self.report_name, res_ids, data=data)
        return [{
            "payload": base64.b64encode(content_bytes).decode("utf-8"),
            "printer": {
                "id": printer.id,
                "name": printer.name,
                "ip": printer.ip,
                "printer_type": printer.printer_type,
            },
        } for printer in printers]

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {"printer_ids"}

    def report_action(self, docids, data=None, config=True):
        result = super().report_action(docids, data, config)
        if result.get('type') != 'ir.actions.report':
            return result
        result['id'] = self.id
        result['printer_ids'] = self.printer_ids.ids
        return result

    def get_action_wizard_printers(self, printer_ids=None):
        self.ensure_one()
        if printer_ids:
            printer_ids = [
                p for p in printer_ids
                if p in self.printer_ids.ids
            ]
        wizard = self.env['select.printer.wizard'].create([{
            'display_printer_ids': self.printer_ids.ids,
            'printer_ids': printer_ids if printer_ids else self.printer_ids.ids,
        }])
        return {
            'name': _("Select Printers for %s", self.name),
            'res_id': wizard.id,
            'type': 'ir.actions.act_window',
            'res_model': 'select.printer.wizard',
            'target': 'new',
            'views': [[False, 'form']],
            'context': {
                'report_id': self.id,
            },
        }
