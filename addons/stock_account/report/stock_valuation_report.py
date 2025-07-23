from collections import defaultdict

from odoo import _, api, models


class StockValuationReport(models.AbstractModel):
    _name = 'stock_account.stock.valuation.report'
    _description = 'Stock Valuation'

    @api.model
    def get_report_values(self, date=False):
        report_values = {
            'data': self._get_report_data(date=date),
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

    def _get_report_data(self, date=False, product_category=False, warehouse=False):
        inventory_valuation_data = self._compute_inventory_valuation(date, product_category)
        accounting_valuation_data = self._compute_accounting_valuation()
        inventory_variation = self._compute_inventory_variation()

        # # - Work In Progress: total of the ongoing MO:
        # #   - An entry by MO;
        # #   - TOTAL
        # data['work_in_progress'] = {
        #     'lines': [
        #         {'name': "MO00051", 'value': 500},
        #     ],
        #     'total': 500,
        # }

        return {
            'company_id': self.env.company.id,
            'currency_id': self.env.company.currency_id.id,
            'accounting_stock_valuation': accounting_valuation_data,
            'inventory_valuation': inventory_valuation_data,
            'inventory_variation': inventory_variation,
        }

    def _compute_inventory_variation(self):
        stock_value = self.env.company.stock_value()['value']
        accounting_stock_value = self.env.company.stock_accounting_value()['value']
        return stock_value - accounting_stock_value

    def _compute_accounting_valuation(self):
        accounting_data = self.env.company.stock_accounting_value()
        initial_value = accounting_data['value']
        amls = self.env['account.move.line']

        for dummy, account_move_lines in accounting_data['accounts']:
            amls |= account_move_lines
        amls_lines = [
            {
                'res_model': 'account.move.line',
                'id': aml.id,
                'display_name': aml.display_name,
                'name': aml.name,
                'value': -aml.balance,
            } for aml in amls
        ]
        initial_value_name = _('Accounting Stock Valuation')
        return {
            'display_name': initial_value_name,
            'name': initial_value_name,
            'value': -initial_value,
            'lines': amls_lines,
        }

    def _compute_inventory_valuation(self, date, product_category):
        """ Compute inventory valuation, product by product."""
        inventory_data = self.env.company.stock_value(at_date=date)
        valuation_line_by_account = []

        for account, details in inventory_data['accounts'].items():
            valuation_lines_by_category = defaultdict(list)
            products = details['products']
            for product, value in products.items():
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

            product_category_valuation_lines = [
                {
                    'res_model': 'product.category' if categ else False,
                    'id': categ.id if categ else False,
                    'display_name': categ.display_name if categ else _('Product without category'),
                    'value': sum(line['value'] for line in product_lines),
                    'lines': product_lines,
                } for (categ, product_lines) in valuation_lines_by_category.items()
            ]
            valuation_line_by_account.append({
                'res_model': 'account.account',
                'id': account.id,
                'display_name': account.display_name,
                'name': account.name,
                'value': details['value'],
                'lines': product_category_valuation_lines,
            })
        return {
            'lines': valuation_line_by_account,
            'value': inventory_data['value'],
        }

    def action_print_as_pdf(self):
        print("TODO")

    def action_print_as_xlsx(self):
        print("TODO")
