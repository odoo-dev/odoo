from odoo import _, api, models
from odoo.tools.misc import formatLang

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

PDP_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'  # Not accepted by SuperPDP due to missing validator

CPRO_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'
CPRO_INVOICE_IDENTIFIER = f'busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##{CPRO_CUSTOMIZATION_ID}::2.1'

PAID_STATES = frozenset({'in_payment', 'paid'})


class AccountEdiXmlUbl21Fr(models.AbstractModel):
    """ French e-invoicing reform (B2B "facturation électronique"): UBL 2.1 syntax of the French CIUS / extension of
    the European norm EN 16931 (norm XP Z12-012, "Socle" external specifications of the DGFiP, v3.x).

    The French format is a CIUS (and extension) of EN 16931 directly, it is NOT a Peppol BIS Billing 3.0 CIUS:
    its CustomizationID is 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr' and its
    ProfileID is the "cadre de facturation" (BT-23: B1, S1, M1, B2, ...). Hence, it is built on the EN 16931
    business rules in the UBL 2.1 syntax only ('account.edi.ubl_cen_en16931'), the Peppol (BIS 3 / PINT) rules are not
    applicable.

    * Specifications: https://www.impots.gouv.fr/specifications-externes-b2b
    * Validation artefacts (BR-FR-*): https://github.com/DGFiP/facturation-electronique (schematrons of the "Socle")
    * EN 16931 UBL binding: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = "account.edi.xml.ubl_21_fr"
    _inherit = ['account.edi.ubl_cen_en16931']
    _description = "France UBL 2.1 E-Invoicing Format"

    @api.model
    def _pdp_can_invoice_b2g(self, customer):
        # We use fields added in this module for B2G
        return self.env['ir.module.module']._get('l10n_fr_facturx_chorus_pro').state == 'installed'

    @api.model
    def _pdp_is_b2g(self, customer):
        # We put the identifier for chorus pro invoices in `peppol_supported_documents`
        # to mark the partner as B2G / "behind Chorus Pro"
        return CPRO_INVOICE_IDENTIFIER in (customer.peppol_supported_documents or [])

    @api.model
    def _pdp_needs_b2g_fields(self, customer):
        return self._pdp_can_invoice_b2g(customer) and self._pdp_is_b2g(customer)

    # -------------------------------------------------------------------------
    # EXPORT: VALUES
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_21_fr.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        # BT-24: the same specification identifier is used for the B2B, the B2G (Chorus Pro) and the self-billed
        # documents (the self-billing is expressed by the type codes 389/261, BR-FR-04).
        if process_type in ('billing', 'selfbilling'):
            return PDP_CUSTOMIZATION_ID
        return super()._get_customization_id(process_type=process_type)

    def _get_business_term_max_lengths(self):
        # EXTENDS account.edi.cen_en16931
        # [BR-FR-MAP-17/18/19] The French CIUS caps the length of some business terms.
        return {
            **super()._get_business_term_max_lengths(),
            'BT-22': 1024,  # Invoice note
            'BT-35': 255,  # Address line 1 (BT-35, BT-50, BT-75, ...)
            'BT-36': 255,  # Address line 2
            'BT-37': 255,  # City
            'BT-38': 10,  # Post code
            'BT-39': 255,  # Country subdivision
            'BT-153': 255,  # Item name
        }

    def _ubl_prepare_base_lines(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_prepare_base_lines(vals)
        # The emptying taxes (e.g. deposits on bottles) are not VAT: they are reported as separated lines.
        vals['base_lines'] = self._turn_emptying_taxes_as_new_base_lines(
            base_lines=vals['base_lines'],
            company=vals['company'],
            vals=vals,
        )

    # -------------------------------------------------------------------------
    # EXPORT: HEADER NODES
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # UBLVersionID is optional and not part of the EN 16931 semantic model: don't report it.
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    def _ubl_add_profile_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # BT-23: "cadre de facturation" (BR-FR-08).
        super()._ubl_add_profile_id_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = self._l10n_fr_pdp_get_profile_id(vals)

    def _ubl_add_due_date_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_due_date_node(vals)
        # [BR-FR-CO-09/BT-23] : Si le cadre de facturation (BT-23) est B2, S2 ou M2, alors la date d'échéance (BT-9) doit
        # être renseignée et correspondre à la date de paiement.
        # For credit notes, this is handled in `_ubl_add_payment_means_nodes` instead (cac:PaymentMeans/cbc:PaymentDueDate).
        if self._is_document(vals, 'invoice', 'self_invoice') and self._l10n_fr_pdp_get_profile_id(vals) in ('B2', 'S2', 'M2'):
            invoice = vals['invoice']
            vals['document_node']['cbc:DueDate']['_text'] = invoice._pdp_get_payment_date() or invoice.invoice_date

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        # [BR-FR-04] 380 (commercial invoice), 389 (self-billed invoice), 386 (down payment invoice).
        super()._ubl_add_invoice_type_code_node(vals)
        if self._is_document(vals, 'invoice') and vals['invoice']._is_downpayment():
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 386

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        # [BR-FR-04] 381 (credit note), 261 (self-billed credit note), 503 (down payment credit note).
        super()._ubl_add_credit_note_type_code_node(vals)
        if self._is_document(vals, 'credit_note') and vals['invoice']._is_downpayment():
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 503

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        # The first note (terms and conditions) is added by the EN 16931 layer.
        super()._ubl_add_notes_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        notes = vals['document_node']['cbc:Note']

        # [BR-FR-05] Mandatory notes (subject code BT-21 + text BT-22) with their defaults.
        for code, default_content in self._get_default_notes(vals).items():
            notes.append({'_text': f"#{code}#{default_content}"})

        # [BR-FR-MAP-18] The Note (BT-22) is capped to 1024 characters.
        for note in notes:
            note['_text'] = self._edi_truncate(note['_text'], 'BT-22')

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        super()._ubl_add_buyer_reference_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note') and self._pdp_needs_b2g_fields(vals['customer'].commercial_partner_id):
            # B2G: the "Code de Service" of Chorus Pro.
            vals['document_node']['cbc:BuyerReference']['_text'] = vals['invoice'].buyer_reference or None

    def _ubl_add_order_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_order_reference_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return
        invoice = vals['invoice']
        if self._pdp_needs_b2g_fields(vals['customer'].commercial_partner_id) and invoice.purchase_order_reference:
            # B2G: the "Engagement Juridique" of Chorus Pro.
            vals['document_node']['cac:OrderReference'] = {
                'cbc:ID': {'_text': invoice.purchase_order_reference},
            }

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_billing_reference_nodes(vals)
        nodes = vals['document_node']['cac:BillingReference']
        invoice = vals['invoice']

        # Règles de gestion G1.52 / [BR-FR-CO-04]: a credit note references the invoice it corrects.
        if self._is_document(vals, 'credit_note', 'self_credit_note'):
            nodes[:] = [{
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': invoice.reversed_entry_id.name},
                    'cbc:IssueDate': {'_text': invoice.reversed_entry_id.invoice_date},
                },
            }]

        # Profile ID X4 - Final invoice with downpayments: reference the down payment invoices.
        if self._is_document(vals, 'invoice', 'self_invoice') and self._l10n_fr_pdp_get_profile_id(vals) in ('B4', 'S4', 'M4'):
            downpayment_moves = invoice.invoice_line_ids._get_downpayment_lines().move_id.filtered(lambda m: m != invoice)
            nodes[:] = [
                {
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': downpayment_move.name},
                        'cbc:IssueDate': {'_text': downpayment_move.invoice_date},
                    },
                }
                for downpayment_move in downpayment_moves
            ]

    # -------------------------------------------------------------------------
    # EXPORT: PARTY NODES
    # -------------------------------------------------------------------------

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # BT-29/BT-46: the SIRET (scheme 0009) of the seller/buyer when known.
        super()._ubl_add_party_identification_nodes(vals)
        nodes = vals['party_node']['cac:PartyIdentification']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if identifier_vals := commercial_partner._get_preferred_legal_entity_identifier_vals():
            # [UBL-SR-16] Buyer identifier shall occur maximum once
            nodes[:] = [{
                'cbc:ID': {'_text': identifier_vals['value'], 'schemeID': identifier_vals['scheme']},
            }]
        elif commercial_partner.ref:
            nodes[:] = [{
                'cbc:ID': {'_text': commercial_partner.ref, 'schemeID': None},
            }]

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        siret = commercial_partner._get_additional_identifier('FR_SIRET')

        # BT-32: Seller tax registration identifier, when the seller has no VAT number.
        if (not commercial_partner.vat or commercial_partner.vat == '/') and siret:
            vals['party_node']['cac:PartyTaxScheme'] = [{
                'cbc:CompanyID': {'_text': siret},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'TAX'},
                },
            }]

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # BT-30/BT-47: the SIREN (scheme 0002) of the seller/buyer ([BR-FR-10]/[BR-FR-11]).
        super()._ubl_add_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        vals['party_node']['cac:PartyLegalEntity'] = {
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {
                '_text': commercial_partner._l10n_fr_pdp_get_siren(),
                'schemeID': '0002',
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT: PAYMENT NODES
    # -------------------------------------------------------------------------

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        super()._ubl_add_payment_means_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        nodes = vals['document_node']['cac:PaymentMeans']
        invoice = vals['invoice']

        # [BR-FR-CO-09/BT-23] : Si le cadre de facturation (BT-23) est B2, S2 ou M2, alors la date d'échéance (BT-9)
        # doit être renseignée et correspondre à la date de paiement.
        if self._is_document(vals, 'credit_note', 'self_credit_note') and self._l10n_fr_pdp_get_profile_id(vals) in ('B2', 'S2', 'M2'):
            payment_due_date = invoice._pdp_get_payment_date() or invoice.invoice_date
            for node in nodes:
                node['cbc:PaymentDueDate'] = {'_text': payment_due_date}

    # -------------------------------------------------------------------------
    # EXPORT: LINE NODES
    # -------------------------------------------------------------------------

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        # OVERRIDE account.edi.ubl
        # BT-146 (net price), BT-147 (price discount) and BT-148 (gross price): the line discount is reported as a line
        # allowance (BG-27), the price discount is then always 0.
        line_node = vals['line_node']
        base_line = vals['line_vals']['base_line']
        suffix = '_currency' if in_foreign_currency else ''
        currency = base_line['currency_id'] if in_foreign_currency else vals['company_currency']
        price_amount = base_line['tax_details'][f'raw_gross_price_unit{suffix}']

        line_node['cac:Price'] = {
            'cbc:PriceAmount': {
                '_text': FloatFmt(price_amount, min_dp=1, max_dp=6),
                'currencyID': currency.name,
            },
            'cac:AllowanceCharge': {
                "cbc:ChargeIndicator": [{
                    "_text": 'false',
                }],
                # Discount amount
                "cbc:Amount": [{
                    "_text": FloatFmt(0, min_dp=1, max_dp=6),
                    "currencyID": currency.name,
                }],
                # Pre-discount amount
                'cbc:BaseAmount': {
                    '_text': FloatFmt(price_amount, min_dp=1, max_dp=6),
                    'currencyID': currency.name,
                },
            }
        }

    # -------------------------------------------------------------------------
    # EXPORT: CONSTRAINTS
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return constraints

        invoice = vals['invoice']

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            commercial_partner = partner.commercial_partner_id
            if commercial_partner.routing_scheme != '0225' or not commercial_partner.routing_endpoint:
                constraints[f"ubl_21_fr_{partner_type}_pdp_identifier_required"] = self.env._("The following partner's French e-invoicing identifier is missing: %s", commercial_partner.display_name)
            identifier_vals = commercial_partner._get_preferred_routing_identifier_vals()
            if not identifier_vals.get('scheme') or not identifier_vals.get('value'):
                constraints[f"ubl_21_fr_{partner_type}_siret_required"] = self.env._("The following partner's SIREN or SIRET is missing: %s", commercial_partner.display_name)

        if self._is_document(vals, 'credit_note', 'self_credit_note') and not (invoice.reversed_entry_id.name or invoice.reversed_entry_id.invoice_date):
            constraints["ubl_21_fr_refund_invoice_reference"] = self.env._("You cannot create a Credit Note without an original invoice: %s", invoice.name)

        customer = vals['customer'].commercial_partner_id
        if self._pdp_is_b2g(customer) and not self._pdp_can_invoice_b2g(customer):
            cpro_module_name = self.env['ir.module.module'].sudo()._get('l10n_fr_facturx_chorus_pro').display_name
            constraints["ubl_21_fr_cpro_module_missing"] = self.env._("This partner is behind Chorus PRO. Please install the module '%s'", cpro_module_name)

        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_add_customer_values(self, collected_values):
        super()._import_ubl_invoice_add_customer_values(collected_values)
        party_tag = "AccountingCustomerParty" if collected_values['odoo_document_type'] == 'sale' else "AccountingSupplierParty"
        collected_values['customer_values']['siret'] = collected_values['tree'].findtext(
            f"./{{*}}{party_tag}/{{*}}Party/{{*}}PartyIdentification/{{*}}ID[@schemeID='0009']"
        )

    def _import_ubl_retrieve_customer_search_plan(self, collected_values):
        return [
            self.env['res.partner']._import_retrieve_customer_from_siret,
            *super()._import_ubl_retrieve_customer_search_plan(collected_values),
        ]

    def _import_ubl_invoice_add_prepaid_amount(self, collected_values):
        # imported invoice is a final invoice following downpayments.
        # We assume all billing references are references to downpayments.
        invoice = collected_values['invoice']
        currency = collected_values['currency_values']['currency']
        tree = collected_values['tree']
        if tree.findtext('./{*}ProfileID') in ('B4', 'S4', 'M4'):
            prepaid_amount = float(tree.findtext('./{*}LegalMonetaryTotal/{*}PrepaidAmount') or 0)
            collected_values['prepaid_amount'] = prepaid_amount
            if not invoice.currency_id.is_zero(prepaid_amount):
                downpayments_names = tree.findall('./{*}BillingReference/{*}InvoiceDocumentReference/{*}ID')
                # groups downpayments by ref to avoid a downpayment being duplicated in the db being substracted multiple times
                grouped_downpayments = self.env['account.move'].search([('ref', 'in', [downpayment.text for downpayment in downpayments_names])]).grouped('ref')

                downpayment_lines = self.env['account.move.line']
                for downpayments in grouped_downpayments.values():
                    downpayment = downpayments[0]
                    for line in downpayment.invoice_line_ids:
                        downpayment_lines |= line.copy({'quantity': -line.quantity if downpayment.move_type == 'in_invoice' else line.quantity})
                collected_values['downpayment_lines'] = downpayment_lines

                # logging
                formatted_amount = formatLang(self.env, prepaid_amount, currency_obj=currency)
                collected_values['logs'].append(_("A downpayment of %s was detected.", formatted_amount))
                for downpayment_name in downpayments_names:
                    if downpayment_name.text not in grouped_downpayments:
                        collected_values['logs'].append(_("Downpayment %s not found. Imported amounts will probably be incorrect.", downpayment_name.text))
        super()._import_ubl_invoice_add_prepaid_amount(collected_values)

    def _import_ubl_invoice_fix_untaxed_amount(self, collected_values):
        # Downpayments may be reported as a prepaid amount.
        # In this case, the final invoice untaxed amount, tax amount and total amount
        # correspond to the amounts without any downpayments made.
        # We need to add the downpayment lines as negative lines in the final invoice
        # because we already imported and accounted for the downpayments.
        super()._import_ubl_invoice_fix_untaxed_amount(collected_values)
        invoice = collected_values['invoice']
        if downpayment_lines := collected_values.get('downpayment_lines'):
            container = {'records': invoice}
            with (
                invoice._check_balanced(container),
                invoice._disable_discount_precision(),
                invoice._sync_dynamic_lines(container),
            ):
                downpayment_lines.move_id = invoice.id
