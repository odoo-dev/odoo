# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import BaseCase
from odoo.addons.l10n_pt_certification.models.account_tax import (
    L10N_PT_TAX_EXEMPTIONS,
    L10N_PT_TAX_EXEMPTION_REASONS_SELECTION,
)


class TestL10nPtExemptionTable(BaseCase):
    """
    Unit tests ensuring complete compliance of the Portuguese Tax Authority (AT)
    exemption reason table (Versão 4.0) with SAF-T (PT) schema limits.
    """

    def test_exemption_mention_length_saf_t_constraint(self):
        """
        AT SAF-T (PT) schema restricts TaxExemptionReason to SAFPTtextType_60 (max 60 characters).
        Every mention to be printed on invoices and exported in SAF-T must strictly respect this limit.
        """
        for code, (mention, _legal_basis) in L10N_PT_TAX_EXEMPTIONS.items():
            self.assertLessEqual(
                len(mention),
                60,
                f"Exemption reason mention for code {code} exceeds 60 characters ({len(mention)}): '{mention}'",
            )

    def test_exemption_codes_completeness(self):
        """ Verify all official AT v4.0 codes are present and revoked codes are excluded. """
        expected_codes = {
            "M01", "M02", "M04", "M05", "M06", "M07", "M09", "M10",
            "M11", "M12", "M13", "M14", "M15", "M16", "M19", "M20",
            "M21", "M25", "M26", "M30", "M31", "M32", "M33", "M34",
            "M35", "M40", "M41", "M42", "M43", "M44", "M45", "M46", "M99",
        }
        actual_codes = set(L10N_PT_TAX_EXEMPTIONS.keys())
        self.assertEqual(expected_codes, actual_codes)

        # Confirm revoked codes are not in the active table
        self.assertNotIn("M03", actual_codes)
        self.assertNotIn("M08", actual_codes)

    def test_exemption_legal_bases_v4(self):
        """ Verify key legal bases and mentions according to official AT v4.0 specification. """
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M09"][1], "Artigo 62.º, alínea b), do CIVA")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M21"][1], "Artigo 72.º, n.º 4, do CIVA")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M26"][1], "Lei n.º 17/2023, de 14 de abril")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M35"][1], "Artigo 2.º, n.º 1, alínea j), do CIVA – Verba 2.42 Lista I")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M44"][1], "Artigo 6.º, n.ºs 7 a 13, do CIVA")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M45"][0], "IVA – regime transfronteiriço de isenção")
        self.assertEqual(L10N_PT_TAX_EXEMPTIONS["M46"][0], "IVA – e-TaxFree")

    def test_exemption_selection_generated(self):
        """ Ensure selection tuples are properly formatted for UI dropdowns. """
        selection_dict = dict(L10N_PT_TAX_EXEMPTION_REASONS_SELECTION)
        self.assertEqual(len(selection_dict), len(L10N_PT_TAX_EXEMPTIONS))
        for code in L10N_PT_TAX_EXEMPTIONS:
            self.assertIn(code, selection_dict)
            self.assertTrue(selection_dict[code].startswith(f"{code} - "))
