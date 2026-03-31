import base64

from odoo import _, fields, models
from odoo.exceptions import UserError


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    printer_ids = fields.Many2many(
        'printers.printer',
        'report_printer_rel',
        'report_id',
        'printer_id',
        string='Printers',
        domain="[('printer_type', '=', 'office_printer')]",
    )

    def get_pdf_bytes(self, printerId, res_ids, data=None):
        """
        Generate PDF and return it as base64 to frontend.
        Frontend will handle sending to proxy.
        """
        self.ensure_one()
        # ovveride to add printer info in the data sent to frontend
        # return [{
        #     "data": base64.b64encode(pdf_bytes).decode("utf-8"),
        #     "printer": {
        #         "id": printerId,
        #         "name": printer.name,
        #         "ip": printer.ip,
        #         "printer_type": printer.printer_type,
        #     },
        # }]

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {"printer_ids"}

    def report_action(self, docids, data=None, config=True):
        result = super().report_action(docids, data, config)
        if result.get('type') != 'ir.actions.report':
            return result
        result['id'] = self.id
        result['printer_ids'] = self.printer_ids.ids
        return result

    def get_action_wizard_printers(self, printerId=None):
        self.ensure_one()
        wizard = self.env['select.printer.wizard'].create([{
            'display_printer_ids': self.printer_ids.ids,
            'printer_id': printerId if printerId else (self.printer_ids.ids[0] if self.printer_ids else False),
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
