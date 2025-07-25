from collections import defaultdict

from odoo import _, api, fields, models


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
        return {
            'doc_ids': docids,
            'doc_model': 'stock.valuation.report',
            'docs': docs,
        }

    def _get_report_context(self):
        # TODO: set default warehouse ? Default category ?
        return {}

    def _get_report_data(self, date=False, product_category=False, warehouse=False):
        # Check if date is a string instance
        if isinstance(date, str):
            date = fields.Date.from_string(date)

        if date == fields.Date.today():
            inventory_data = self.env.company.stock_value()
            accounting_data = self.env.company.stock_accounting_value()
        else:
            inventory_data = self.env.company.stock_value(at_date=date)
            accounting_data = self.env.company.stock_accounting_value(at_date=date)

        accounts = inventory_data['accounts'].keys() | accounting_data['accounts'].keys()

        accounts_lines = []

        for account in accounts:
            inventory_dict = inventory_data['accounts'].get(account)
            accounting_dict = accounting_data['accounts'].get(account)
            inventory_value = inventory_dict['value'] if inventory_dict else 0
            accounting_value = accounting_dict['value'] if accounting_dict else 0
            account_line = {
                'res_model': 'account.account',
                'id': account.id,
                'display_name': account.display_name,
                'name': account.name,
                'balance': accounting_value,
                'inventory': inventory_value,
                'to_book': inventory_value - accounting_value,
            }
            accounts_lines.append(account_line)

            products = self.env['product.product']
            if inventory_dict:
                products |= self.env['product.product'].concat(*inventory_dict['products'].keys())
            if accounting_dict:
                products |= self.env['product.product'].concat(*accounting_dict['products'].keys())

            valuation_lines_by_category = defaultdict(list)
            for product in products:
                balance = accounting_dict['products'].get(product, {}).get('value', 0) if accounting_dict else 0
                inventory = inventory_dict['products'].get(product, 0) if inventory_dict else 0
                product_valuation_line = {
                    'res_model': 'product.product',
                    'id': product.id,
                    'display_name': product.display_name,
                    'name': product.name,
                    'balance': balance,
                    'inventory': inventory,
                    'to_book': inventory - balance,
                }
                valuation_lines_by_category[product.categ_id].append(product_valuation_line)

            product_category_valuation_lines = [{
                'res_model': 'product.category' if categ else False,
                'id': categ.id if categ else False,
                'display_name': categ.display_name if categ else _('Product without category'),
                'inventory': sum(line['inventory'] for line in product_lines),
                'lines': product_lines,
            } for (categ, product_lines) in valuation_lines_by_category.items()]
            account_line['lines'] = product_category_valuation_lines


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
            'accounting_stock_valuation': False,
            'inventory_valuation': False,
            'inventory_variation': False,
        }

    def action_print_as_pdf(self):
        print("TODO")

    def action_print_as_xlsx(self):
        print("TODO")
