from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

L10N_PT_TAX_REGIONS_SELECTION = [
    ('PT-ALL', 'All Regions'),
    ('PT', 'Mainland Portugal'),
    ('PT-MA', 'Madeira'),
    ('PT-AC', 'Azores'),
]

L10N_PT_TAX_CATEGORIES_SELECTION = [
    ('N', 'Normal'),
    ('I', 'Intermediate'),
    ('R', 'Reduced'),
    ('E', 'Exempt'),
]

# https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Faturacao/Fatcorews/Documents/Tabela_Codigos_Motivo_Isencao.pdf
# AT Official Exemption Reasons Table (Versão 4.0)
# Mapping: code -> (invoice_mention <= 60 chars, legal_basis)
L10N_PT_TAX_EXEMPTIONS = {
    "M01": ("Artigo 16.º, n.º 6, do CIVA", "Artigo 16.º, n.º 6, alíneas a) a d), do CIVA"),
    "M02": ("Artigo 6.º do Decreto-Lei n.º 198/90", "Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de junho"),
    "M04": ("Isento Artigo 13.º do CIVA", "Artigo 13.º do CIVA"),
    "M05": ("Isento Artigo 14.º do CIVA", "Artigo 14.º do CIVA"),
    "M06": ("Isento Artigo 15.º do CIVA", "Artigo 15.º do CIVA"),
    "M07": ("Isento Artigo 9.º do CIVA", "Artigo 9.º do CIVA"),
    "M09": ("IVA – não confere direito a dedução", "Artigo 62.º, alínea b), do CIVA"),
    "M10": ("IVA – regime de isenção", "Artigo 53.º, n.º 1, do CIVA"),
    "M11": ("Regime particular do tabaco", "Decreto-Lei n.º 346/85, de 23 de agosto"),
    "M12": ("Regime da margem de lucro – Agências de viagens", "Decreto-Lei n.º 221/85, de 3 de julho"),
    "M13": ("Regime da margem de lucro – Bens em segunda mão", "Decreto-Lei n.º 199/96, de 18 de outubro"),
    "M14": ("Regime da margem de lucro – Objetos de arte", "Decreto-Lei n.º 199/96, de 18 de outubro"),
    "M15": ("Regime margem lucro – Objetos de coleção/antiguidades", "Decreto-Lei n.º 199/96, de 18 de outubro"),
    "M16": ("Isento Artigo 14.º do RITI", "Artigo 14.º do RITI"),
    "M19": ("Outras isenções", "Outras isenções temporárias determinadas por legislação avulsa"),
    "M20": ("IVA – regime forfetário", "Artigo 59.º-D, n.º 2, do CIVA"),
    "M21": ("IVA – não confere direito a dedução", "Artigo 72.º, n.º 4, do CIVA"),
    "M25": ("Mercadorias à consignação", "Artigo 38.º, n.º 1, alínea a), do CIVA"),
    "M26": ("Isenção de IVA com dedução no cabaz alimentar", "Lei n.º 17/2023, de 14 de abril"),
    "M30": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea i), do CIVA"),
    "M31": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea j), do CIVA"),
    "M32": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea l), do CIVA"),
    "M33": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea m), do CIVA"),
    "M34": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea n), do CIVA"),
    "M35": ("IVA – autoliquidação", "Artigo 2.º, n.º 1, alínea j), do CIVA – Verba 2.42 Lista I"),
    "M40": ("IVA – autoliquidação", "Artigo 6.º, n.º 6, alínea a), do CIVA"),
    "M41": ("IVA – autoliquidação", "Artigo 8.º, n.º 3, do RITI"),
    "M42": ("IVA – autoliquidação", "Decreto-Lei n.º 21/2007, de 29 de janeiro"),
    "M43": ("IVA – autoliquidação", "Decreto-Lei n.º 362/99, de 16 de setembro"),
    "M44": ("IVA – Regras específicas – artigo 6.º", "Artigo 6.º, n.ºs 7 a 13, do CIVA"),
    "M45": ("IVA – regime transfronteiriço de isenção", "Artigo 58.º-A do CIVA"),
    "M46": ("IVA – e-TaxFree", "Decreto-Lei n.º 19/2017, de 14 de fevereiro"),
    "M99": ("Não sujeito ou não tributado", "Outras situações de não liquidação do imposto"),
}

L10N_PT_TAX_EXEMPTION_REASONS_SELECTION = [
    (code, f"{code} - {mention} ({legal})")
    for code, (mention, legal) in L10N_PT_TAX_EXEMPTIONS.items()
]


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_pt_tax_exemption_reason = fields.Selection(string="Tax Exemption Reason", selection=L10N_PT_TAX_EXEMPTION_REASONS_SELECTION)

    @api.constrains('l10n_pt_tax_exemption_reason')
    def _validate_l10n_pt_tax_exemption_reason(self):
        """
        According to Portugal's tax authority: "The proram should ensure the enforceability for the user
        to present a reason for not assessing tax, if it is the case."
        """
        for tax in self:
            if tax.country_code == 'PT' and tax.amount == 0 and not tax.l10n_pt_tax_exemption_reason:
                raise ValidationError(_("Exempt taxes require an exemption reason."))


class AccountTaxGroup(models.Model):
    _inherit = "account.tax.group"

    l10n_pt_tax_region = fields.Selection(string="Region (PT)", selection=L10N_PT_TAX_REGIONS_SELECTION, default="PT")
    l10n_pt_tax_category = fields.Selection(string="Tax Category (PT)", selection=L10N_PT_TAX_CATEGORIES_SELECTION, default="N")
