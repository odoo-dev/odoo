from odoo import api, fields, models, _
from odoo.exceptions import UserError

class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_tr_gib_invoice_type = fields.Selection(
        selection_add=[("İADE", "Return"), ("TEVKIFAT_İADE", "Withholding Return")]
    )

    @api.constrains("l10n_tr_gib_invoice_scenario","l10n_tr_gib_invoice_type")
    def _check_invoice_scenario_and_type(self):
        for record in self:
            if record.l10n_tr_gib_invoice_type in ["İADE", "TEVKIFAT_İADE"] and record.l10n_tr_gib_invoice_scenario != "TEMELFATURA":
                raise UserError(_("Invoice scenario must be Basic for return invoice types"))
