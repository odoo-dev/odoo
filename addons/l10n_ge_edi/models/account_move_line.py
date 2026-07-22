# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    l10n_ge_edi_line_id = fields.Char(
        string="RS.ge Line Id",
        readonly=True,
        copy=False,
    )

    def _l10n_ge_edi_drg_amount(self):
        exempt_group = self.env.ref(
            "l10n_ge.ge_tax_group_vat_exempt",
            raise_if_not_found=False,
        )
        zero_rated_group = self.env.ref(
            "l10n_ge.ge_tax_group_vat_0",
            raise_if_not_found=False,
        )
        tax_group = self.tax_ids[:1].tax_group_id
        if tax_group == exempt_group:
            return -1
        if tax_group == zero_rated_group:
            return 0
        return self.price_total - self.price_subtotal

    def _l10n_ge_edi_matches_rsge(self, remote_line):
        return (
            remote_line.get("GOODS") == (self.name or self.product_id.display_name)
            and remote_line.get("G_UNIT") == (self.product_uom_id.name or "pcs")
            and float(remote_line.get("G_NUMBER", "nan")) == self.quantity
            and float(remote_line.get("FULL_AMOUNT", "nan")) == self.price_total
            and float(remote_line.get("DRG_AMOUNT", "nan"))
            == self._l10n_ge_edi_drg_amount()
        )
