# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
import re

from odoo import api, fields, models, _
from odoo.tools.safe_eval import safe_eval
from odoo.exceptions import UserError


REGEX_FORMULA_OBJECT = re.compile(r'((?:product\[\')(?P<field>\w+)(?:\'\]))+')


class AccountTaxPython(models.Model):
    _inherit = "account.tax"

    amount_type = fields.Selection(selection_add=[
        ('code', 'Python Code')
    ], ondelete={'code': lambda recs: recs.write({'amount_type': 'percent', 'active': False})})

    python_compute = fields.Text(string='Python Code', default="result = price_unit * 0.10",
        help="Compute the amount of the tax by setting the variable 'result'.\n\n"
            ":param base_amount: float, actual amount on which the tax is applied\n"
            ":param price_unit: float\n"
            ":param quantity: float\n"
            ":param company: res.company recordset singleton\n"
            ":param product: product.product recordset singleton or None\n"
            ":param partner: res.partner recordset singleton or None")
    python_applicable = fields.Text(string='Applicable Code', default="result = True",
        help="Determine if the tax will be applied by setting the variable 'result' to True or False.\n\n"
            ":param price_unit: float\n"
            ":param quantity: float\n"
            ":param company: res.company recordset singleton\n"
            ":param product: product.product recordset singleton or None\n"
            ":param partner: res.partner recordset singleton or None")

    @api.model
    def _process_as_fixed_tax_amount_batch(self, batch):
        # EXTENDS 'account'
        if batch['amount_type'] == 'code':
            return True
        return super()._process_as_fixed_tax_amount_batch(batch)

    @api.model
    def _eval_taxes_computation_prepare_product_fields(self, taxes_data):
        # EXTENDS 'account'
        field_names = super()._eval_taxes_computation_prepare_product_fields(taxes_data)
        Product = self.env['product.product']
        for tax_data in taxes_data:
            if tax_data['amount_type'] == 'code':
                tax = self.browse(tax_data['id'])
                for formula in ((tax.python_applicable or '').strip(), (tax.python_compute or '').strip()):
                    formula = self._adapt_fomula_to_python(formula)
                    groups = REGEX_FORMULA_OBJECT.findall(formula)
                    if groups:
                        for group in groups:
                            field_name = group[1]
                            if field_name in Product:
                                field_names.add(field_name)

        return field_names

    @api.model
    def _eval_tax_amount(self, tax_data, evaluation_context):
        # EXTENDS 'account'
        amount_type = tax_data['amount_type']
        if amount_type == 'code':
            tax = self.browse(tax_data['id'])
            raw_base = evaluation_context['raw_price'] + evaluation_context['extra_base']
            local_dict = {**evaluation_context, 'base_amount': raw_base}
            json.dumps(local_dict) # Ensure it contains only json serializable data (security).
            try:
                python_applicable_formula = self._adapt_fomula_to_python(tax.python_applicable)
                safe_eval(python_applicable_formula, local_dict, mode="exec", nocopy=True)
            except Exception as e: # noqa: BLE001
                raise UserError(_(
                    "You entered invalid code %r in %r taxes\n\nError : %s",
                    tax.python_applicable,
                    tax_data['name'],
                    e
                )) from e
            is_applicable = local_dict.get('result', False)
            if not is_applicable:
                return

            try:
                python_compute_formula = self._adapt_fomula_to_python(tax.python_compute)
                safe_eval(python_compute_formula, local_dict, mode="exec", nocopy=True)
            except Exception as e: # noqa: BLE001
                raise UserError(_(
                    "You entered invalid code %r in %r taxes\n\nError : %s",
                    tax.python_compute,
                    tax_data['name'],
                    e
                )) from e
            return local_dict.get('result', 0.0)
        return super()._eval_tax_amount(tax_data, evaluation_context)

    def _adapt_fomula_to_python(self, formula):
        groups = re.findall(r'((?:product\.)(?P<field>\w+))+', formula) or []
        Product = self.env['product.product']
        for group in groups:
            field_name = group[1]
            if field_name in Product and not Product._fields[field_name].relational:
                formula = formula.replace(f"product.{field_name}", f"product['{field_name}']")
        return formula
