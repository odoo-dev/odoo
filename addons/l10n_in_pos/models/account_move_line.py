from odoo import models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    def _set_l10n_in_gstr_section(self):
        super()._set_l10n_in_gstr_section()

        in_pos_closing_and_reversed_lines = self.filtered(
            lambda l: l.move_id.country_code == 'IN'
            and l.move_id.move_type == 'entry'
            and l.display_type in ('product', 'tax')
            and (l.move_id.pos_session_ids or l.move_id.reversed_pos_order_id)
        )
        if not in_pos_closing_and_reversed_lines:
            return

        tax_tags_dict = self._get_l10n_in_tax_tag_ids()
        all_gst_tags = [tag for tag_list in tax_tags_dict.values() for tag in tag_list]

        for line in in_pos_closing_and_reversed_lines:
            tax_tags = line.tax_tag_ids.ids
            if any(tag in tax_tags for tag in all_gst_tags):
                line.l10n_in_gstr_section = 'sale_b2cs'
            elif any(tax.l10n_in_tax_type == 'nil_rated' for tax in line.tax_ids):
                line.l10n_in_gstr_section = 'sale_nil_rated'
            elif any(tax.l10n_in_tax_type == 'exempt' for tax in line.tax_ids):
                line.l10n_in_gstr_section = 'sale_exempt'
            elif any(tax.l10n_in_tax_type == 'non_gst' for tax in line.tax_ids):
                line.l10n_in_gstr_section = 'sale_non_gst_supplies'
            else:
                line.l10n_in_gstr_section = 'sale_out_of_scope'
