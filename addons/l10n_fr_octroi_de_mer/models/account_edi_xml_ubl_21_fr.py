from odoo import api, models

from odoo.addons.account_edi_ubl_cii.models.account_edi_common import FloatFmt


class AccountEdiXmlUbl21Fr(models.AbstractModel):
    _inherit = 'account.edi.xml.ubl_21_fr'

    @api.model
    def _ubl_add_line_allowance_charge_nodes(self, vals):
        super()._ubl_add_line_allowance_charge_nodes(vals)
        product = vals['base_line']['product_id']
        if not product.l10n_fr_border_reference:
            return

        line_node = vals['line_node']
        for rate in (product.l10n_fr_rate, product.l10n_fr_regional_rate):
            if rate:
                line_node['cac:AllowanceCharge'].append({
                    '_currency': vals['currency_id'],
                    'cbc:ChargeIndicator': {'_text': 'true'},
                    'cbc:AllowanceChargeReasonCode': {'_text': 'ZZZ'},
                    'cbc:AllowanceChargeReason': {'_text': f'Octroi de Mer ({rate}%)'},
                    'cbc:MultiplierFactorNumeric': {'_text': rate},
                    'cbc:Amount': {
                        '_text': FloatFmt(vals['base_line']['price_unit'] * (rate / 100), min_dp=1, max_dp=6),
                        'currencyID': vals['currency_id'].name,
                    },
                    'cbc:BaseAmount': {
                        '_text': FloatFmt(vals['base_line']['price_unit'], min_dp=1, max_dp=6),
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
