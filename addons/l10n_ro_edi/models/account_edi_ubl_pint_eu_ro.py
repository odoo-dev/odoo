from odoo import models
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import documents

DEFAULT_VAT = '0000000000000'

def _has_vat(vat):
    return bool(vat and len(vat) > 1)

def get_formatted_sector_ro(city: str):
    return city.upper().replace(' ', '')


class AccountEdiUBLPintRO(models.AbstractModel):
    _name = "account.edi.ubl_pint_eu_ro"
    _inherit = "account.edi.ubl_pint_eu"
    _description = "UBL PINT RO Common"

    @documents(['pint_eu_ro'])
    def _ubl_add_customization_id_node__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1'

    @documents(['pint_eu_ro'])
    def _ubl_add_tax_currency_code_node__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        self._ubl_add_tax_currency_code_node_company_currency(vals)

    @documents(['pint_eu_ro'])
    def _ubl_get_partner_address_node__pint_eu_ro(self, vals, partner):
        # EXTENDS account.edi.ubl_pint
        node = super()._ubl_get_partner_address_node(vals, partner)

        if not partner.state_id:
            return node

        node['cbc:CountrySubentity']['_text'] = f'{partner.country_code}-{partner.state_id.code}'

        # Romania requires the CityName to be in the format of "SECTORX" if the address state is in Bucharest.
        if partner.state_id.code == 'B' and partner.city:
            node['cbc:CityName']['_text'] = get_formatted_sector_ro(partner.city)

        return node

    @documents(['pint_eu_ro'])
    def _ubl_add_accounting_supplier_party_tax_scheme_nodes__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        company_id = None

        if not _has_vat(commercial_partner.vat):
            if commercial_partner.company_registry:
                company_id = commercial_partner.company_registry
        else:
            company_id = commercial_partner.vat

        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': company_id},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT' if company_id[:2].isalpha() else 'NOT_EU_VAT'},
            },
        }] if company_id else []

    @documents(['pint_eu_ro'])
    def _ubl_add_accounting_supplier_party_legal_entity_nodes__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_accounting_supplier_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if not _has_vat(commercial_partner.vat):
            if commercial_partner.company_registry:
                vals['party_node']['cac:PartyLegalEntity'] = [{
                    'cbc:RegistrationName': {'_text': commercial_partner.name},
                    'cbc:CompanyID': {
                        '_text': commercial_partner.company_registry,
                        'schemeID': None,
                    },
                }]
            else:
                vals['party_node']['cac:PartyLegalEntity'] = []

    @documents(['pint_eu_ro'])
    def _ubl_add_accounting_customer_party_tax_scheme_nodes__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_accounting_customer_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if not _has_vat(commercial_partner.vat):
            company_id = DEFAULT_VAT
        else:
            company_id = commercial_partner.vat

        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': company_id},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT' if company_id[:2].isalpha() else 'NOT_EU_VAT'},
            },
        }] if company_id else []

    @documents(['pint_eu_ro'])
    def _ubl_add_accounting_customer_party_legal_entity_nodes__pint_eu_ro(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_accounting_customer_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if not _has_vat(commercial_partner.vat):
            vals['party_node']['cac:PartyLegalEntity'] = [{
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': DEFAULT_VAT,
                    'schemeID': None,
                },
            }]
