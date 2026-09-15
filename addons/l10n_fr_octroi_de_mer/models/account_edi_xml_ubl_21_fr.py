from odoo import api, models

from odoo.addons.account_edi_ubl_cii.models.account_edi_common import FloatFmt


class AccountEdiXmlUbl21Fr(models.AbstractModel):
    _inherit = 'account.edi.xml.ubl_21'

    @api.model
    def _ubl_add_line_allowance_charge_nodes(self, vals):
        super()._ubl_add_line_allowance_charge_nodes(vals)
        product = vals['base_line']['product_id']
        if not product.l10n_fr_border_reference:
            return

        line_node = vals['line_node']
        for rate in (product.l10n_fr_rate_id, product.l10n_fr_regional_rate_id):
            if rate:
                tax_vals = next((vals for vals in vals['base_line']['tax_details']['taxes_data'] if vals['tax'] == rate), None)
                line_node['cac:AllowanceCharge'].append({
                    '_currency': vals['currency_id'],
                    'cbc:ChargeIndicator': {'_text': 'true'},
                    'cbc:AllowanceChargeReasonCode': {'_text': 'ZZZ'},
                    'cbc:AllowanceChargeReason': {'_text': f'Octroi de Mer ({rate.amount}%)'},
                    'cbc:MultiplierFactorNumeric': {'_text': rate.amount},
                    'cbc:Amount': {
                        '_text': FloatFmt(tax_vals['tax_amount'], max_dp=vals['currency_dp']),
                        'currencyID': vals['currency_id'].name,
                    },
                    'cbc:BaseAmount': {
                        '_text': FloatFmt(tax_vals['base_amount'], max_dp=vals['currency_dp']),
                        'currencyID': vals['currency_id'].name,
                    },
                })

    @api.model
    def _ubl_add_line_item_commodity_classification_nodes(self, vals):
        super()._ubl_add_line_item_commodity_classification_nodes(vals)
        product = vals['base_line']['product_id']
        if not product.l10n_fr_border_reference:
            return

        vals['line_node']['cac:Item']['cac:CommodityClassification'].append({
            'cbc:ItemClassificationCode': {
                '_text': product.l10n_fr_border_reference,
                'listID': 'CN',
            },
        })

    def _ubl_default_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        grouping_key = super()._ubl_default_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if tax_data and tax_data['tax'].tax_group_id in {
            self.env['account.chart.template'].ref('tax_group_sea_grant', raise_if_not_found=False),
            self.env['account.chart.template'].ref('tax_group_regional_sea_grant', raise_if_not_found=False),
        }:
            grouping_key['scheme_id'] = 'OM'

        return grouping_key
