from odoo import models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    def _prepare_base_line_for_taxes_computation(self, record, **kwargs):
        base_line = super()._prepare_base_line_for_taxes_computation(record, **kwargs)
        rebu_tax = self.env.ref('account.2_account_tax_template_rebu')
        if rebu_tax in base_line['tax_ids']:
            def load(field, fallback):
                return self._get_base_line_field_value_from_record(record, field, kwargs, fallback)
            base_line.update({
                'purchase_price': load('purchase_price', 0.0)
            })
        return base_line

    def _add_tax_details_in_base_line(self, base_line, company, rounding_method=None):
        rebu_tax = self.env.ref('account.2_account_tax_template_rebu')

        if not (rebu_tax in base_line['tax_ids'] and base_line.get('purchase_price')):
            return super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)

        rounding_method = rounding_method or company.tax_calculation_rounding_method

        sale_price_unit_after_discount = base_line['price_unit'] * (1 - (base_line['discount'] / 100.0))
        sale_amount = sale_price_unit_after_discount * base_line['quantity']

        margin_price_unit = max(sale_price_unit_after_discount - base_line['purchase_price'], 0.0)
        margin_taxes_computation = base_line['tax_ids']._get_tax_details(
            price_unit=margin_price_unit,
            quantity=base_line['quantity'],
            precision_rounding=base_line['currency_id'].rounding,
            rounding_method=rounding_method,
            product=base_line['product_id'],
            product_uom=base_line['product_uom_id'],
            special_mode=base_line['special_mode'],
            filter_tax_function=base_line['filter_tax_function'],
            document_tax_mode=base_line['document_tax_mode'],
        )

        rate = base_line['rate']
        tax_on_margin_currency = (
            margin_taxes_computation['total_included'] - margin_taxes_computation['total_excluded']
        )

        base_line['tax_details'] = {
            'raw_total_excluded_currency': sale_amount - tax_on_margin_currency,
            'raw_total_excluded': (sale_amount - tax_on_margin_currency) / rate if rate else 0.0,
            'raw_total_included_currency': sale_amount,
            'raw_total_included': sale_amount / rate if rate else 0.0,
            'taxes_data': [
                {
                    **tax_data,
                    'raw_tax_amount_currency': tax_data['tax_amount'],
                    'raw_tax_amount': tax_data['tax_amount'] / rate if rate else 0.0,
                    # esto SÍ es la base real (el margen), la que va al informe de IVA
                    'raw_base_amount_currency': tax_data['base_amount'],
                    'raw_base_amount': tax_data['base_amount'] / rate if rate else 0.0,
                }
                for tax_data in margin_taxes_computation['taxes_data']
            ],
        }

        if rounding_method == 'round_per_line':
            base_line['tax_details']['raw_total_excluded'] = company.currency_id.round(
                base_line['tax_details']['raw_total_excluded']
            )
            base_line['tax_details']['raw_total_included'] = company.currency_id.round(
                base_line['tax_details']['raw_total_included']
            )
