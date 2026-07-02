from odoo import api, fields, models


class L10nESVatRegimeMixin(models.AbstractModel):
    _name = 'l10n.es.vat.regime.mixin'
    _description = "Mixin to manage the VAT Regime Code in Spanish localization"

    # -------------------------------------------------------------------------
    # EXTENSION CONTRACT
    #
    # This mixin holds the codes shared by the Spanish EDI's (SII, TicketBAI,
    # VeriFactu). Each EDI module is expected to extend it rather than assume the
    # generic catalog/availability below fits its own rules:
    #
    # - `_l10n_es_vat_regime_code_labels`: override with `super() + dict.update()` to
    #   add/replace the labels only relevant to your EDI (use a `_xx` suffix, e.g.
    #   `11_vf`, when the same numeric code means something different in your EDI).
    # - `_l10n_es_vat_regime_get_available_codes`: override to return the subset of
    #   codes valid for your EDI. ALWAYS gate the override behind your own
    #   res.company boolean (e.g. `company_id.l10n_es_edi_verifactu_required`) and
    #   fall back to `super()` when it doesn't apply — this is what makes the override
    #   order-independent when several EDI modules are installed together (no reliance
    #   on MRO order).
    # - Redeclare `@api.depends(...)` on the computes you override, including your
    #   res.company boolean, so the field recomputes when that config changes.
    #
    # A code used by more than one EDI with the SAME meaning (e.g. '12_sale'/'13_sale',
    # used by both SII and TBAI) belongs HERE, in the shared core catalog/availability,
    # not duplicated in each EDI's own override. Only add a code in an EDI's own
    # override when it's exclusive to that EDI, or means something different there
    # (in which case use a distinct `_xx` suffix, e.g. `11_vf`, instead of reusing the
    # bare code). Two EDI's overrides CAN both `update()` the same key without harm
    # (last one applied wins the label text; `_l10n_es_vat_regime_get_available_codes`
    # never merges lists across modules — see below), but that's a symptom the code
    # should have been added here instead.
    #
    # `_REGIME_CODES_BY_USE` is the generic fallback (no specific EDI required).
    # -------------------------------------------------------------------------

    _REGIME_CODES_BY_USE = {
        'sale': [
            '01', '03', '04', '05', '06', '07', '08',
            '02_sale', '09_sale', '12_sale', '13_sale',
            '10', '11', '14', '15', '17',
        ],
        'purchase': [
            '01', '03', '04', '05', '06', '07', '08',
            '02_purchase', '09_purchase', '12_purchase', '13_purchase'
        ],
    }

    l10n_es_available_vat_regime_code_ids = fields.Char(
        string="Available VAT Regime Codes",
        compute="_compute_l10n_es_vat_regime_available",
        help="Technical field to enable a dynamic selection of the field \"VAT Regime Code\"",
    )
    l10n_es_vat_regime_code_id = fields.Selection(
        string="VAT Regime Code",
        selection="_l10n_es_vat_regime_code_selection",
        compute="_compute_l10n_es_vat_regime_codes",
        readonly=False,
        store=True,
    )
    l10n_es_vat_regime_code_additional = fields.Selection(
        string="VAT Regime Code (Additional)",
        selection="_l10n_es_vat_regime_code_selection",
        compute="_compute_l10n_es_vat_regime_codes",
        readonly=False,
        store=True,
    )

    @api.model
    def _l10n_es_vat_regime_code_labels(self):
        """Return {code: label} for the codes shared across EDI's.

        Override with `super() + dict.update(...)` to add codes specific to a
        given EDI (see the extension contract above).
        """
        return {
            # Shared
            '01': "01 - Operación de régimen general",
            '03': "03 - Bienes usados, arte, antigüedades y colección",
            '04': "04 - Oro de inversión",
            '05': "05 - Agencias de viajes",
            '06': "06 - Grupo de entidades en IVA (Nivel Avanzado)",
            '07': "07 - Criterio de caja",
            '08': "08 - IPSI / IGIC",
            # Same number, different meaning
            '02_sale': "02 - Exportación",
            '02_purchase': "02 - Compensaciones REAGYP en adquisiciones",
            '09_sale': "09 - Agencias mediadoras (D.A.4ª RD1619/2012)",
            '09_purchase': "09 - Adquisiciones intracomunitarias",
            '12_sale': "12 - Arrendamiento local no sujeto a retención",
            '12_purchase': "12 - Arrendamiento local de negocio",
            '13_sale': "13 - Arrendamiento local sujeto y no sujeto a retención",
            '13_purchase': "13 - Importación sin DUA",
            # Sales only
            '10': "10 - Cobros por cuenta de terceros",
            '11': "11 - Arrendamiento sujeto a retención",
            '14': "14 - IVA pendiente — certificaciones de obra (AAPP)",
            '15': "15 - IVA pendiente — tracto sucesivo",
            '17': "17 - OSS e IOSS",  # already used natively by SII's legacy method and by l10n_eu_oss
            # '18' (Recargo de equivalencia) is NOT here: it's exclusive to VeriFactu's own catalog
            # (see l10n_es_edi_verifactu/const.py). l10n_es's own chart template no longer pre-sets
            # it on generic recargo tax templates — VeriFactu backfills it itself when a company
            # enables l10n_es_edi_verifactu_required (see res_company.py in that module).
        }

    @api.model
    def _l10n_es_vat_regime_code_selection(self):
        return sorted(self._l10n_es_vat_regime_code_labels().items(), key=lambda code_label: code_label[1])

    def _l10n_es_vat_regime_get_use(self):
        """Override in each model to return 'sale' or 'purchase'."""
        raise NotImplementedError

    def _l10n_es_vat_regime_get_available_codes(self):
        """Return the list of codes valid for this record.

        Override to restrict to the codes valid for a specific EDI, gated
        behind that EDI's res.company boolean, falling back to `super()`
        otherwise (see the extension contract above).
        """
        self.ensure_one()
        use = self._l10n_es_vat_regime_get_use()
        return self._REGIME_CODES_BY_USE.get(use, [])

    @api.depends()
    def _compute_l10n_es_vat_regime_available(self):
        for record in self:
            valid = record._l10n_es_vat_regime_get_available_codes()
            record.l10n_es_available_vat_regime_code_ids = ','.join(valid) if valid else False

    @api.depends()
    def _compute_l10n_es_vat_regime_codes(self):
        for record in self:
            valid = record._l10n_es_vat_regime_get_available_codes()
            if record.l10n_es_vat_regime_code_id not in valid:
                record.l10n_es_vat_regime_code_id = False
            if record.l10n_es_vat_regime_code_additional not in valid:
                record.l10n_es_vat_regime_code_additional = False
