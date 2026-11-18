from odoo import models


class PrinterReportMixin(models.AbstractModel):
    """Make a model whose PDF is built by its own engine (no QWeb template)
    printable on printers and downloadable through a report action.

    Inheriting models set ``_printer_report_action`` to the xml id of an
    ``ir.actions.report`` on their model, and implement ``export_to_pdf(data)``
    returning a dict whose ``file_content`` is the PDF content. ``data`` is what was
    given to ``print_to_printer``; it comes back from the client on download, so it
    must be treated as untrusted input.
    """
    _name = "printer.report.mixin"
    _description = "Printable Report Mixin"

    _printer_report_action = None

    def _get_printer_report_action(self):
        return self.env.ref(self._printer_report_action)

    def _has_printers(self):
        return bool(self._get_printer_report_action().printer_ids)

    def print_to_printer(self, data):
        self.ensure_one()
        return self._get_printer_report_action().report_action(self.ids, data={"printer_data": data}, config=False)
