from odoo.exceptions import UserError

from odoo import _, models

l10n_tr_official_code_categories = [
    "res_partner_category_hizmetno",
    "res_partner_category_mersisno",
    "res_partner_category_tesisatno",
    "res_partner_category_telefonno",
    "res_partner_category_distributorno",
    "res_partner_category_ticaretsicilno",
    "res_partner_category_tapdkno",
    "res_partner_category_bayino",
    "res_partner_category_aboneno",
    "res_partner_category_sayacno",
    "res_partner_category_epdkno",
    "res_partner_category_subeno",
    "res_partner_category_pasaportno",
    "res_partner_category_ureticino",
    "res_partner_category_ciftcino",
    "res_partner_category_imalatcino",
    "res_partner_category_dosyano",
    "res_partner_category_hastano",
    "res_partner_category_musterino",
    "res_partner_category_aracikurumvkn",
    "res_partner_category_aracikurumetiket",
]

l10n_tr_official_mandatory_code_categories = [
    "res_partner_category_mersisno",
    "res_partner_category_ticaretsicilno",
]


class PartnerCategory(models.Model):
    _inherit = "res.partner.category"

    def _get_categories_from_xml_ids(self, xml_ids_list):
        categories = self.env["res.partner.category"]
        for xml_id in xml_ids_list:
            categories |= self.env.ref(f"l10n_tr_nilvera_einvoice.{xml_id}")
        return categories

    def _get_l10n_tr_official_categories(self):
        return self._get_categories_from_xml_ids(l10n_tr_official_code_categories)

    def _get_l10n_tr_official_mandatory_categories(self):
        return self._get_categories_from_xml_ids(l10n_tr_official_mandatory_code_categories)

    def unlink(self):
        official_ids = self._get_l10n_tr_official_categories().ids

        # Check if any of the records to delete are official codes
        if any(rec.id in official_ids for rec in self):
            raise UserError(_("The 'Tagname' cannot be deleted because it is used in Türkiye E-Documents"))

        return super().unlink()
