# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import _, api, fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    _REGIME_CODES_BY_USE = {
        'sale': [
            '01', '03', '04', '05', '06', '07', '08',
            '02_sale', '09_sale', '12_sale', '13_sale',
            '10', '11', '14_sale', '15', '17',
        ],
        'purchase': [
            '01', '03', '04', '05', '06', '07', '08',
            '02_purchase', '09_purchase', '12_purchase', '13_purchase'
        ],
    }

    l10n_es_exempt_reason = fields.Selection(
        selection=[
            ('E1', 'Art. 20'),
            ('E2', 'Art. 21'),
            ('E3', 'Art. 22'),
            ('E4', 'Art. 23 y 24'),
            ('E5', 'Art. 25'),
            ('E6', 'Otros'),
        ],
        string="Exempt Reason (Spain)",
    )
    l10n_es_type = fields.Selection(
        selection=[
            ('exento', 'Exento'),
            ('sujeto', 'Sujeto o ISP intracomunitario'),
            ('sujeto_agricultura', 'Sujeto Agricultura'),
            ('sujeto_isp', 'Sujeto ISP'),
            ('no_sujeto', 'No Sujeto'),
            ('no_sujeto_loc', 'No Sujeto por reglas de Localization'),
            ('no_deducible', 'No Deducible'),
            ('retencion', 'Retencion'),
            ('recargo', 'Recargo de Equivalencia'),
            ('dua', 'DUA'),
            ('ignore', 'Ignore even the base amount'),
        ],
        string="Tax Type (Spain)", default='sujeto'
    )
    l10n_es_bien_inversion = fields.Boolean('Bien de Inversion', default=False)

    l10n_es_available_regime_codes = fields.Char(
        string="Available VAT Regime Codes",
        compute="_compute_l10n_es_regime_available",
        help="Technical field to enable a dynamic selection of the field \"VAT Regime Code\"",
    )
    l10n_es_regime_code = fields.Selection(
        string="VAT Regime Code",
        selection="_l10n_es_regime_code_selection",
        compute="_compute_l10n_es_regime_codes",
        readonly=False,
        store=True,
    )
    l10n_es_regime_code_additional = fields.Selection(
        string="VAT Regime Code (Additional)",
        selection="_l10n_es_regime_code_selection",
        compute="_compute_l10n_es_regime_codes",
        readonly=False,
        store=True,
    )

    # -------------------------------------------------------------------------
    # EDI HELPERS
    # -------------------------------------------------------------------------

    def _l10n_es_get_regime_code(self):
        # Regime codes (ClaveRegimenEspecialOTrascendencia)
        # NOTE there's 11 more codes to implement, also there can be up to 3 in total
        # See https://www.gipuzkoa.eus/documents/2456431/13761128/Anexo+I.pdf/2ab0116c-25b4-f16a-440e-c299952d683d
        oss_tag = self.env.ref('l10n_eu_oss.tag_oss', raise_if_not_found=False)

        # If there's an OSS tax, it is considered an OSS operation
        if oss_tag and oss_tag in self.invoice_repartition_line_ids.tag_ids:
            return '17'

        if self.filtered(lambda t: t.l10n_es_exempt_reason == 'E2'):
            return '02'

        return '01'

    @api.model
    def _l10n_es_get_sujeto_tax_types(self):
        return ['sujeto', 'sujeto_isp', 'sujeto_agricultura']

    @api.model
    def _l10n_es_get_main_tax_types(self):
        return {'exento', 'sujeto', 'sujeto_agricultura', 'sujeto_isp', 'no_sujeto', 'no_sujeto_loc', 'no_deducible'}

    # -------------------------------------------------------------------------
    # VAT REGIME CODE
    #
    # These `@api.model` methods hold the codes shared by the Spanish EDI's (SII, TicketBAI,
    # VeriFactu). Each EDI module extends `_l10n_es_regime_code_labels` (with
    # `super() + dict.update()`) and/or `_l10n_es_regime_available_codes` (with its own
    # `use`/`applicability`/`company` handling, falling back to `super()`) rather than assuming
    # the generic catalog below fits its own rules. `account.move` reuses these same methods
    # through the representative tax of its lines instead of duplicating them.
    #
    # A code used by more than one EDI with the SAME meaning (e.g. '12_sale'/'13_sale', used by
    # both SII and TBAI) belongs in the shared core catalog below, not duplicated in each EDI's
    # own override. Only add a code in an EDI's own override when it's exclusive to that EDI, or
    # means something different there (in which case use a distinct `_xx` suffix, e.g. `11_vf`,
    # instead of reusing the bare code).
    # -------------------------------------------------------------------------

    @api.model
    def _l10n_es_regime_code_labels(self):
        """Return {code: label} for the codes shared across EDI's.

        Override with `super() + dict.update(...)` to add codes specific to a given EDI.
        """
        return {
            # Shared
            '01': _("01 - General regime operation"),
            '03': _("03 - Used goods, art, antiques and collectors' items"),
            '04': _("04 - Investment gold"),
            '05': _("05 - Travel agencies"),
            '06': _("06 - VAT group of entities (Advanced level)"),
            '07': _("07 - Cash basis criterion"),
            '08': _("08 - IPSI / IGIC"),
            # Same number, different meaning
            '02_sale': _("02 - Export"),
            '02_purchase': _("02 - REAGYP compensations on purchases"),
            '09_sale': _("09 - Intermediary agencies (4th Additional Provision, RD 1619/2012)"),
            '09_purchase': _("09 - Intra-Community acquisitions"),
            '12_sale': _("12 - Business premises lease not subject to withholding"),
            '12_purchase': _("12 - Business premises lease"),
            '13_sale': _("13 - Business premises lease subject and not subject to withholding"),
            '13_purchase': _("13 - Import without customs declaration (DUA)"),
            # Sales only
            '10': _("10 - Collections on behalf of third parties"),
            '11': _("11 - Lease subject to withholding"),
            '14_sale': _("14 - Pending VAT — public works certifications (public administrations)"),
            '15': _("15 - Pending VAT — continuous supply contracts"),
            '17': _("17 - OSS and IOSS"),
        }

    @api.model
    def _l10n_es_regime_code_selection(self):
        # Resolve every label to real text here, in a plain `for` loop (not a lambda or
        # comprehension, which run in their own frame without `self`): this lets Odoo find
        # `self.env` and translate lazy labels (e.g. `_lt()` in l10n_es_edi_verifactu's
        # const.py) properly instead of just logging a warning. It also means the ORM never
        # has to resolve a lazy label itself afterwards (e.g. in `_description_selection`),
        # and LazyGettext doesn't support `<`, so plain strings are needed for sorting anyway.
        resolved = []
        for code, label in self._l10n_es_regime_code_labels().items():
            resolved.append((code, str(label)))
        return sorted(resolved, key=lambda code_label: code_label[1])

    @api.model
    def _l10n_es_regime_available_codes(self, use, applicability=None, company=None):
        """Return the list of codes valid for a given use ('sale'/'purchase').

        Override to restrict the codes valid for a specific EDI, gated behind that EDI's
        res.company boolean (on `company`, defaulting to `self.env.company`), falling back to
        `super()` otherwise — this is what makes the override order-independent when several EDI
        modules are installed together (no reliance on MRO order).
        """
        return self._REGIME_CODES_BY_USE.get(use, [])

    def _l10n_es_regime_get_use(self):
        self.ensure_one()
        if self.type_tax_use == 'sale':
            return 'sale'
        if self.type_tax_use == 'purchase':
            return 'purchase'
        return None

    def _l10n_es_regime_get_available_codes(self):
        self.ensure_one()
        use = self._l10n_es_regime_get_use()
        return self._l10n_es_regime_available_codes(use, company=self.company_id)

    @api.depends('type_tax_use')
    def _compute_l10n_es_regime_available(self):
        for tax in self:
            valid = tax._l10n_es_regime_get_available_codes()
            tax.l10n_es_available_regime_codes = ','.join(valid) if valid else False

    @api.depends('type_tax_use')
    def _compute_l10n_es_regime_codes(self):
        for tax in self:
            valid = tax._l10n_es_regime_get_available_codes()
            if tax.l10n_es_regime_code not in valid:
                tax.l10n_es_regime_code = False
            if tax.l10n_es_regime_code_additional not in valid:
                tax.l10n_es_regime_code_additional = False
