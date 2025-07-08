from collections import defaultdict

from odoo import api, models


class StockValuationReport(models.AbstractModel):
    _name = 'stock_account.stock.valuation.report'
    _description = 'Stock Valuation'

    @api.model
    def get_report_values(self):
        report_values = {
            'data': self._get_report_data(),
            'context': self._get_report_context(),
        }
        return report_values

    @api.model
    def _get_report_values(self, docids, data=None):
        docs = []
        doc = self._get_report_data()
        docs.append(self._include_pdf_specifics(doc, data))
        report_values = {
            'doc_ids': docids,
            'doc_model': 'mrp.production',
            'docs': docs,
        }
        return report_values

    def _get_report_context(self):
        # TODO: set default warehouse ? Default category ?
        return {}

    def _get_report_data(self, product_category=False, warehouse=False):
        stock_initial = self.env.company.stock_accounting_value(product_categories=product_category)
        inventory_valuation_data = self._compute_inventory_valuation(product_category)
        accounting_stock_valuation = inventory_valuation_data['value']

        # # - Work In Progress: total of the ongoing MO:
        # #   - An entry by MO;
        # #   - TOTAL
        # data['work_in_progress'] = {
        #     'lines': [
        #         {'name': "MO00051", 'value': 500},
        #     ],
        #     'total': 500,
        # }

        data = {
            'company_id': self.env.company.id,
            'currency_id': self.env.company.currency_id.id,
            'accounting_stock_valuation': accounting_stock_valuation,
            'inventory_valuation': inventory_valuation_data,
            'stock_initial': stock_initial,
            'stock_variation': accounting_stock_valuation - stock_initial,
        }
        return data

    def _compute_inventory_valuation(self, product_category):
        """ Compute inventory valuation, product by product."""
        domain = []
        if product_category:
            domain = [('categ_id', '=', product_category.id)]
        products = self.env['product.product'].search(domain)
        valuation_lines_by_category = defaultdict(list)
        total = 0
        for product in products:
            value = self.env.company.stock_value(products=product)
            if not value:
                continue
            product_valuation_line = {
                'res_model': 'product.product',
                'id': product.id,
                'display_name': product.display_name,
                'name': product.name,
                'value': value,
            }
            valuation_lines_by_category[product.categ_id].append(product_valuation_line)
            total += value

        product_category_valuation_lines = [
            {
                'res_model': 'product.category',
                'id': categ.id,
                'display_name': categ.display_name,
                'value': sum([line['value'] for line in product_lines]),
                'lines': product_lines,
            } for (categ, product_lines) in valuation_lines_by_category.items()
        ]
        return {
            'lines': product_category_valuation_lines,
            'value': total,
        }

    def action_print_as_pdf(self):
        print("TODO")

    def action_print_as_xlsx(self):
        print("TODO")
