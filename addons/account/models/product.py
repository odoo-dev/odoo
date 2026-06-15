from difflib import SequenceMatcher

from odoo import api, fields, models, _, Command
from odoo.exceptions import ValidationError
from odoo.fields import Domain
from odoo.tools import format_amount, frozendict
from odoo.tools.misc import split_every
from odoo.tools.constants import PREFETCH_MAX

ACCOUNT_DOMAIN = "[('account_type', 'not in', ('asset_receivable','liability_payable','asset_cash','liability_credit_card','off_balance'))]"


class ProductCategory(models.Model):
    _inherit = "product.category"

    property_account_income_categ_id = fields.Many2one('account.account', company_dependent=True,
        string="Income Account",
        domain=ACCOUNT_DOMAIN,
        help="This account will be used when validating a customer invoice.",
        tracking=True,
        ondelete='restrict',
    )
    property_account_expense_categ_id = fields.Many2one('account.account', company_dependent=True,
        string="Expense Account",
        domain=ACCOUNT_DOMAIN,
        help="The expense is accounted for when a vendor bill is validated, except in anglo-saxon accounting with perpetual inventory valuation in which case the expense (Cost of Goods Sold account) is recognized at the customer invoice validation.",
        tracking=True,
        ondelete='restrict',
    )

#----------------------------------------------------------
# Products
#----------------------------------------------------------


class ProductTemplate(models.Model):
    _inherit = "product.template"

    taxes_id = fields.Many2many('account.tax', 'product_taxes_rel', 'prod_id', 'tax_id',
        string="Sales Taxes",
        help="Default taxes used when selling the product",
        domain=[('type_tax_use', '=', 'sale')],
        default=lambda self: self.env.companies.account_sale_tax_id or self.env.companies.root_id.sudo().account_sale_tax_id,
    )
    tax_string = fields.Char(compute='_compute_tax_string')
    supplier_taxes_id = fields.Many2many('account.tax', 'product_supplier_taxes_rel', 'prod_id', 'tax_id',
        string="Purchase Taxes",
        help="Default taxes used when buying the product",
        domain=[('type_tax_use', '=', 'purchase')],
        default=lambda self: self.env.companies.account_purchase_tax_id or self.env.companies.root_id.sudo().account_purchase_tax_id,
    )
    property_account_income_id = fields.Many2one('account.account', company_dependent=True, ondelete='restrict',
        string="Income Account",
        domain=ACCOUNT_DOMAIN,
        help="Keep this field empty to use the default value from the product category.")
    property_account_income_active = fields.Boolean(related='property_account_income_id.active', string="Income Account Active")
    property_account_expense_id = fields.Many2one('account.account', company_dependent=True, ondelete='restrict',
        string="Expense Account",
        domain=ACCOUNT_DOMAIN,
        help="Keep this field empty to use the default value from the product category. If anglo-saxon accounting with automated valuation method is configured, the expense account on the product category will be used.")
    property_account_expense_active = fields.Boolean(related='property_account_expense_id.active', string="Expense Account Active")
    account_tag_ids = fields.Many2many(
        string="Account Tags",
        comodel_name='account.account.tag',
        domain="[('applicability', '=', 'products')]",
        help="Tags to be set on the base and tax journal items created for this product.")
    fiscal_country_codes = fields.Char(compute='_compute_fiscal_country_codes')

    def _get_product_accounts(self):
        return {
            'income': (
                self.property_account_income_id
                or self._get_category_account('property_account_income_categ_id')
                or (self.company_id or self.env.company).income_account_id
            ), 'expense': (
                self.property_account_expense_id
                or self._get_category_account('property_account_expense_categ_id')
                or (self.company_id or self.env.company).expense_account_id
            ),
        }

    def _get_category_account(self, field_name):
        """
        Return the first account defined on the product category hierarchy
        for the given field.
        """
        categ = self.categ_id
        while categ:
            account = categ[field_name]
            if account:
                return account
            categ = categ.parent_id
        return self.env['account.account']

    def get_product_accounts(self, fiscal_pos=None):
        return {
            key: (fiscal_pos or self.env['account.fiscal.position']).map_account(account)
            for key, account in self._get_product_accounts().items()
        }

    @api.depends('company_id')
    @api.depends_context('allowed_company_ids')
    def _compute_fiscal_country_codes(self):
        for record in self:
            allowed_companies = record.company_id or self.env.companies
            record.fiscal_country_codes = ",".join(allowed_companies.mapped('account_fiscal_country_id.code'))

    @api.depends('taxes_id', 'list_price')
    @api.depends_context('company')
    def _compute_tax_string(self):
        for record in self:
            record.tax_string = record._construct_tax_string(record.list_price)

    def _construct_tax_string(self, price):
        currency = self.currency_id
        res = self.taxes_id._filter_taxes_by_company(self.env.company).compute_all(
            price, product=self, partner=self.env['res.partner'],
        )
        joined = []
        included = res['total_included']
        if currency.compare_amounts(included, price):
            joined.append(_('%(amount)s Incl. Taxes', amount=format_amount(self.env, included, currency)))
        excluded = res['total_excluded']
        if currency.compare_amounts(excluded, price):
            joined.append(_('%(amount)s Excl. Taxes', amount=format_amount(self.env, excluded, currency)))
        if joined:
            tax_string = f"(= {', '.join(joined)})"
        else:
            tax_string = " "
        return tax_string

    @api.constrains('uom_id')
    def _check_uom_not_in_invoice(self):
        self.env['product.template'].flush_model(['uom_id'])
        self.env.cr.execute("""
            SELECT prod_template.id
              FROM account_move_line line
              JOIN product_product prod_variant ON line.product_id = prod_variant.id
              JOIN product_template prod_template ON prod_variant.product_tmpl_id = prod_template.id
              JOIN uom_uom template_uom ON prod_template.uom_id = template_uom.id
              JOIN uom_uom line_uom ON line.product_uom_id = line_uom.id
             WHERE prod_template.id IN %s
               AND line.parent_state = 'posted'
               AND template_uom.id != line_uom.id
             LIMIT 1
        """, [tuple(self.ids)])
        if self.env.cr.fetchall():
            raise ValidationError(_(
                "This product is already being used in posted Journal Entries.\n"
                "If you want to change its Unit of Measure, please archive this product and create a new one."
            ))

    @api.onchange('type')
    def _onchange_type(self):
        if self.type == 'combo':
            self.taxes_id = False
            self.supplier_taxes_id = False
        return super()._onchange_type()

    def _force_default_sale_tax(self, companies):
        default_customer_taxes = companies.filtered('account_sale_tax_id').account_sale_tax_id
        if not default_customer_taxes:
            return
        links = [Command.link(t.id) for t in default_customer_taxes]
        for sub_ids in split_every(self.env.cr.IN_MAX, self.ids):
            chunk = self.browse(sub_ids)
            chunk.write({'taxes_id': links})
            chunk.invalidate_recordset(['taxes_id'])

    def _force_default_purchase_tax(self, companies):
        default_supplier_taxes = companies.filtered('account_purchase_tax_id').account_purchase_tax_id
        if not default_supplier_taxes:
            return
        links = [Command.link(t.id) for t in default_supplier_taxes]
        for sub_ids in split_every(self.env.cr.IN_MAX, self.ids):
            chunk = self.browse(sub_ids)
            chunk.write({'supplier_taxes_id': links})
            chunk.invalidate_recordset(['supplier_taxes_id'])

    def _force_default_tax(self, companies):
        self._force_default_sale_tax(companies)
        self._force_default_purchase_tax(companies)

    @api.model_create_multi
    def create(self, vals_list):
        products = super().create(vals_list)
        # If no company was set for the product, the product will be available for all companies and therefore should
        # have the default taxes of the other companies as well. sudo() is used since we're going to need to fetch all
        # the other companies default taxes which the user may not have access to.
        other_companies = self.env['res.company'].sudo().search(['!', ('id', 'child_of', self.env.companies.ids)])
        if other_companies and products:
            products_without_company = products.filtered(lambda p: not p.company_id).sudo()
            products_without_company._force_default_tax(other_companies)
        return products

    def _get_list_price(self, price):
        """ Get the product sales price from a public price based on taxes defined on the product """
        self.ensure_one()
        if not self.taxes_id:
            return super()._get_list_price(price)
        computed_price = self.taxes_id.compute_all(price, self.currency_id)
        total_included = computed_price["total_included"]

        if price == total_included:
            # Tax is configured as price included
            return total_included
        # calculate base from tax
        included_computed_price = self.taxes_id.with_context(force_price_include=True).compute_all(price, self.currency_id)
        return included_computed_price['total_excluded']

    def _get_price_diff_account(self):
        self.ensure_one()
        return False


class ProductProduct(models.Model):
    _inherit = "product.product"

    tax_string = fields.Char(compute='_compute_tax_string')

    def _get_product_accounts(self):
        return self.product_tmpl_id._get_product_accounts()

    @api.model
    def _adapt_document_values_to_product(self, document_values, product):
        document_type = document_values['document_type']
        if not product or document_type not in ('sale', 'purchase'):
            return

        company = document_values['company']
        if document_type == 'sale':
            document_values['taxes'] = product.taxes_id._filter_taxes_by_company(company)
            document_values['price_unit'] = product.with_company(company).lst_price
        else:
            document_values['taxes'] = self.supplier_taxes_id._filter_taxes_by_company(company)
            document_values['price_unit'] = product.with_company(company).standard_price

        document_values['document_tax_mode'] = company.account_price_include
        document_values['product'] = product
        document_values['uom'] = product.uom_id
        document_values['currency'] = product.currency_id or product.company_id.currency_id or document_values['company'].currency_id
        document_values['fiscal_position'] = self.env['account.fiscal.position']

    @api.model
    def _adapt_document_values_to_currency(self, document_values, currency):
        previous_currency = document_values['currency']
        if not currency:
            return

        document_values['currency'] = currency
        if previous_currency and previous_currency != currency:
            document_values['price_unit'] = previous_currency._convert(
                document_values['price_unit'],
                currency,
                document_values['company'],
                document_values['document_date'],
                round=False,
            )

    @api.model
    def _adapt_document_values_to_uom(self, document_values, uom):
        previous_uom = document_values['uom']
        if not uom:
            return

        document_values['uom'] = uom
        if previous_uom and previous_uom != uom:
            document_values['price_unit'] = previous_uom._compute_price(document_values['price_unit'], uom)

    @api.model
    def _adapt_document_values_to_document_tax_mode(self, document_values, document_tax_mode):
        current_document_tax_mode = document_values['document_tax_mode']
        if not document_tax_mode or current_document_tax_mode == document_tax_mode:
            return

        results = document_values['taxes']._get_tax_details(
            price_unit=document_values['price_unit'],
            quantity=1.0,
            rounding_method='round_globally',
            product=document_values['product'],
            product_uom=document_values['uom'],
            document_tax_mode=current_document_tax_mode,
        )
        if document_tax_mode == 'tax_included':
            price_unit = results['total_included']
            for tax in results['taxes_data']:
                if tax['tax'].price_include_override == 'tax_excluded':
                    price_unit -= tax['tax_amount']
        else:
            price_unit = results['total_excluded']
            for tax in results['taxes_data']:
                if tax['tax'].price_include_override == 'tax_included':
                    price_unit += tax['tax_amount']

        document_values['document_tax_mode'] = document_tax_mode
        document_values['price_unit'] = price_unit

    @api.model
    def _adapt_document_values_to_fiscal_position(self, document_values, fiscal_position):
        """ Adapt the product values to the fiscal position.

        :param product_values:     The product values created by '_get_default_product_values' or prepared in
                                   '_get_line_price_unit'.
        :param fiscal_position:    The fiscal position to adapt to.
        :return:                   A dictionary of adapted product values.
        """
        taxes = document_values['taxes']
        price = document_values['price_unit']

        if taxes and fiscal_position:
            taxes_after_fp = fiscal_position.map_tax(taxes)
            if taxes != taxes_after_fp:
                price = taxes._adapt_price_unit_to_another_taxes(
                    price_unit=document_values['price_unit'],
                    product=document_values['product'],
                    original_taxes=taxes,
                    new_taxes=taxes_after_fp,
                    document_tax_mode=document_values['document_tax_mode'],
                )
                taxes = taxes_after_fp

        document_values['price_unit'] = price
        document_values['taxes'] = taxes

    def _get_default_product_values(self, company, document_type):
        """ Get the default product values for a document type.

        :param document_type:   The type of the document.
        :return:                A dictionary of default product values.
        """
        self.ensure_one()

        uom = self.uom_id

        if document_type == 'sale':
            taxes = self.taxes_id._filter_taxes_by_company(company)
        elif document_type == 'purchase':
            taxes = self.supplier_taxes_id._filter_taxes_by_company(company)
        else:
            taxes = self.env['account.tax']

        if document_type == 'sale':
            price = self.with_company(company).lst_price
        elif document_type == 'purchase':
            price = self.with_company(company).standard_price
        else:
            price = 0.0

        if document_type == 'sale':
            currency = self.currency_id
        elif document_type == 'purchase':
            currency = company.currency_id
        else:
            currency = self.env['res.currency']

        return {
            'product': self,
            'price_unit': price,
            'uom': uom,
            'taxes': taxes,
            'currency': currency,
            'company': company,
            'document_tax_mode': None,
        }

    @api.model
    def _adapt_product_values_to_currency(self, product_values, currency, conversion_date):
        """ Adapt the product values to the given currency at a specific date.

        :param product_values:     The product values created by '_get_default_product_values' or prepared in
                                   '_get_line_price_unit'.
        :param currency:           The currency to adapt to.
        :param conversion_date:    The date to use for the currency conversion.
        :return:                   A dictionary of adapted product values.
        """
        product_currency = product_values['currency']

        if product_currency != currency:
            price = product_currency._convert(
                product_values['price_unit'],
                currency,
                product_values['company'],
                conversion_date,
                round=False,
            )
        else:
            price = product_values['price_unit']

        return {
            **product_values,
            'price_unit': price,
            'currency': currency,
        }

    @api.model
    def _adapt_product_values_to_document_tax_mode(self, product_values, document_tax_mode):
        """ Adapt the product values to the tax mode forced for the document.

        :param product_values:       The product values created by '_get_default_product_values' or prepared in
                                     '_get_line_price_unit'.
        :param document_tax_mode:    The tax mode forced for the document.
        :return:                     A dictionary of adapted product values.
        """
        if document_tax_mode is None:
            return product_values

        results = product_values['taxes']._get_tax_details(
            price_unit=product_values['price_unit'],
            quantity=1.0,
            rounding_method='round_globally',
            product=product_values['product'],
            product_uom=product_values['uom'],
            document_tax_mode=product_values['document_tax_mode'],
        )
        if document_tax_mode == 'tax_included':
            price = results['total_included']
            for tax in results['taxes_data']:
                if tax['tax'].price_include_override == 'tax_excluded':
                    price -= tax['tax_amount']
        else:
            price = results['total_excluded']
            for tax in results['taxes_data']:
                if tax['tax'].price_include_override == 'tax_included':
                    price += tax['tax_amount']

        return {
            **product_values,
            'price_unit': price,
            'document_tax_mode': document_tax_mode,
        }

    @api.model
    def _adapt_product_values_to_uom(self, product_values, uom):
        """ Adapt the product values to the given uom.

        :param product_values:    The product values created by '_get_default_product_values' or prepared in
                                  '_get_line_price_unit'.
        :param uom:               The uom to adapt to.
        :return:                  A dictionary of adapted product values.
        """
        product_uom = product_values['uom']

        # Apply unit of measure.
        if product_uom and product_uom != uom:
            price = product_uom._compute_price(product_values['price_unit'], uom)
        else:
            price = product_values['price_unit']

        return {
            **product_values,
            'uom': uom,
            'price_unit': price,
        }

    @api.model
    def _adapt_product_values_to_fiscal_position(self, product_values, fiscal_position):
        """ Adapt the product values to the fiscal position.

        :param product_values:     The product values created by '_get_default_product_values' or prepared in
                                   '_get_line_price_unit'.
        :param fiscal_position:    The fiscal position to adapt to.
        :return:                   A dictionary of adapted product values.
        """
        taxes = product_values['taxes']
        price = product_values['price_unit']

        if taxes and fiscal_position:
            taxes_after_fp = fiscal_position.map_tax(taxes)
            if taxes != taxes_after_fp:
                price = taxes._adapt_price_unit_to_another_taxes(
                    price_unit=product_values['price_unit'],
                    product=product_values['product'],
                    original_taxes=taxes,
                    new_taxes=taxes_after_fp,
                    document_tax_mode=product_values['document_tax_mode'],
                )
                taxes = taxes_after_fp

        return {
            **product_values,
            'price_unit': price,
            'taxes': taxes,
        }

    def _serialize_price_unit_json(self, price_unit_json):
        values = dict(price_unit_json)

        # Can't changed because it's the nature of the document itself. No need to store it then.
        values.pop('document_type', None)

        if company := values.pop('company', None):
            values['company'] = company.id
        if product := values.pop('product', None):
            values['product'] = product.id
        if uom := values.pop('uom', None):
            values['uom'] = uom.id
        if taxes := values.pop('taxes', None):
            values['taxes'] = taxes.ids
        if currency := values.pop('currency', None):
            values['currency'] = currency.id
        if fiscal_position := values.pop('fiscal_position', None):
            values['fiscal_position'] = fiscal_position.id
        return values

    def _unserialize_price_unit_json(self, price_unit_json):
        values = dict(price_unit_json or {})
        if values.get('company'):
            values['company'] = self.env['res.company'].browse(values['company'])
        if values.get('product'):
            values['product'] = self.env['product.product'].browse(values['product'])
        if values.get('uom'):
            values['uom'] = self.env['uom.uom'].browse(values['uom'])
        if values.get('taxes'):
            values['taxes'] = self.env['account.tax'].browse(values['taxes'])
        if values.get('currency'):
            values['currency'] = self.env['res.currency'].browse(values['currency'])
        if values.get('fiscal_position'):
            values['fiscal_position'] = self.env['account.fiscal.position'].browse(values['fiscal_position'])
        return values

    def _price_unit_json_dependency_has_changed(self, previous_document_values, new_document_values, field):
        return new_document_values[field] != previous_document_values.get(field)

    def _adapt_price_unit_to(
        self,
        document_type,
        company,
        price_unit,
        from_product=None,
        to_product=None,
        manual_price_unit=None,
        from_uom=None,
        to_uom=None,
        from_taxes=None,
        to_taxes=None,
        from_currency=None,
        to_currency=None,
        document_date=None,
        from_document_tax_mode=None,
        to_document_tax_mode=None,
        from_fiscal_position=None,
        to_fiscal_position=None,
    ):
        previous_document_values = {
            'document_type': document_type,
            'company': company,
            'price_unit': price_unit,

            'product': from_product,
            'uom': from_uom,
            'taxes': from_taxes,

            'currency': from_currency,
            'document_date': document_date,
            'fiscal_position': from_fiscal_position,
            'document_tax_mode': from_document_tax_mode,
        }
        new_document_values = {
            'document_type': document_type,
            'company': company,
            'price_unit': price_unit,

            'product': to_product,
            'uom': to_uom,
            'taxes': to_taxes,

            'currency': to_currency,
            'document_date': document_date,
            'fiscal_position': to_fiscal_position,
            'document_tax_mode': to_document_tax_mode,
        }

        def has_changed(field):
            return self._price_unit_json_dependency_has_changed(previous_document_values, new_document_values, field)

        if to_product and has_changed('product'):
            self._adapt_document_values_to_product(previous_document_values, to_product)
        if manual_price_unit is not None:
            previous_document_values['price_unit'] = manual_price_unit
        if to_fiscal_position and has_changed('fiscal_position'):
            self._adapt_document_values_to_fiscal_position(previous_document_values, to_fiscal_position)
        if to_currency and has_changed('currency'):
            self._adapt_document_values_to_currency(previous_document_values, to_currency)
        if has_changed('taxes'):
            previous_document_values['taxes'] = to_taxes
        if to_uom and has_changed('uom'):
            self._adapt_document_values_to_uom(previous_document_values, to_uom)
        if to_document_tax_mode and has_changed('document_tax_mode'):
            self._adapt_document_values_to_document_tax_mode(previous_document_values, to_document_tax_mode)

        return previous_document_values

    def _adapt_price_unit(
        self,
        document_type,
        company,

        product=None,
        uom=None,
        taxes=None,
        price_unit=None,
        manual_price_unit=None,

        currency=None,
        document_date=None,
        fiscal_position=None,
        document_tax_mode=None,
        price_unit_json=None,
    ):
        previous_document_values = self._unserialize_price_unit_json(price_unit_json)
        previous_document_values = self._adapt_price_unit_to(
            document_type,
            company,
            price_unit,
            from_product=previous_document_values.get('product'),
            to_product=product,
            from_uom=previous_document_values.get('uom'),
            to_uom=uom,
            from_taxes=previous_document_values.get('taxes'),
            to_taxes=taxes,
            from_currency=previous_document_values.get('currency'),
            to_currency=currency,
            document_date=document_date,
            from_document_tax_mode=previous_document_values.get('document_tax_mode'),
            to_document_tax_mode=document_tax_mode,
            from_fiscal_position=previous_document_values.get('fiscal_position'),
            to_fiscal_position=fiscal_position,
            manual_price_unit=manual_price_unit,
        )
        return self._serialize_price_unit_json(previous_document_values)

    def _get_line_price_unit(self, line, document_type, price=None):
        """ Helper for account.move, sale.order and purchase.order to get the price unit
        in various cases, even when there isn't a specified product (self = self.env['product.product']).

        :param line:            Line from account.move, sale.order or purchase.order.
        :param document_type:   The type of document, either 'sale' or 'purchase'.
        :param price:           Used in sale.order and purchase.order to pass on the price_unit after further adaptation
                                due to pricelist/discounts/combos..etc. Important note: if price is not None it means
                                that if there is a fiscal position set on the document we need to apply it again.
        :return:                Unit price after adapting it to any changes made on the line.
        """
        product = self

        # Handling line values that have different names in the three models
        is_account_move = 'move_id' in line._fields
        line_parent_id = line.move_id if is_account_move else line.order_id
        line_date = line_parent_id.date if is_account_move else line_parent_id.date_order
        line_uom = line.uom_id if 'uom_id' in line._fields else line.product_uom_id

        new_product_set = product and (not line.price_unit_json or not line.price_unit_json['product_id'] or line.price_unit_json['product_id'] != product.id)

        # Adapt the uom if it is the first time the price unit is computed and when the uom has changed since the last computation
        apply_uom = (not line.price_unit_json and not price) or (line.price_unit_json and line.price_unit_json['uom_id'] != line_uom.id)

        # Adapt the document tax mode if it is the first time the price unit is computed, when the tax mode is different than the one set on the product and when the document tax mode has changed since the last computation
        apply_document_tax_mode = (not line.price_unit_json and not price) or (line.document_tax_mode != line.company_id.account_price_include) or (line.price_unit_json and line.price_unit_json['document_tax_mode'] != line.document_tax_mode)

        # Adapt the fiscal position here only when a new product is set on the line and the fiscal position set is not domestic
        apply_fiscal_position = (new_product_set and line_parent_id.fiscal_position_id != line.company_id.domestic_fiscal_position_id) or (
            not is_account_move and price and line.price_unit_json and line_parent_id.fiscal_position_id and line_parent_id.fiscal_position_id != line.company_id.domestic_fiscal_position_id
        )

        # When a new product is set on the line it means we can use the default values from the product in _get_tax_included_unit_price.
        # For sale.order and purchase.order when the fiscal position is changed we also start the computation from the default values
        if new_product_set or (price and apply_fiscal_position):
            product_values = None  # this will lead to the use of default_values
            apply_document_tax_mode = True
            apply_uom = is_account_move  # for sale/purchase.order if the price is given, the uom has already been applied
        # When we cannot use the default values we need to prepare the product_values as a screenshot of the state right
        # before the change that has triggered the price_unit compute leading up to this method
        else:
            if line.price_unit_json:
                uom = self.env['uom.uom'].browse(line.price_unit_json['uom_id']) if line.price_unit_json['uom_id'] else None
                dtm = line.price_unit_json['document_tax_mode'] if line.price_unit_json['document_tax_mode'] else None
            else:
                uom = line_uom
                dtm = line.company_id.account_price_include

            product_values = {
                'product': product,
                'uom': uom,
                'price': price if price is not None else line.price_unit,  # condition needs to be 'is not None' because price could be 0.0
                'taxes': line.tax_ids,
                'document_tax_mode': dtm,
                'currency': line.currency_id,
                'company': line.company_id,
            }

        return product._get_tax_included_unit_price(
            product_price_unit=price,
            company=line.company_id,
            currency=line.currency_id if is_account_move else None,
            document_date=line_date,
            document_type=document_type,
            fiscal_position=line_parent_id.fiscal_position_id if apply_fiscal_position else None,
            product_uom=line_uom if apply_uom else None,
            document_tax_mode=line.document_tax_mode if apply_document_tax_mode else None,
            product_values=product_values,
        )

    def _get_tax_included_unit_price(self, company, currency, document_date, document_type,
        is_refund_document=False, product_uom=None, product_currency=None,
        product_price_unit=None, product_taxes=None, fiscal_position=None,
        document_tax_mode=None, product_values=None,
    ):
        """ Helper to get the price unit from different models.
            This is needed to compute the same unit price in different models (sale order, account move, etc.) with same parameters.
        """
        if self:
            self.ensure_one()

        if not product_values:
            product_values = self._get_default_product_values(company, document_type)
            if product_currency:
                product_values['currency'] = product_currency
            if product_taxes:
                product_values['taxes'] = product_taxes
            if product_price_unit:
                product_values['price_unit'] = product_price_unit

        product_values = self._adapt_product_values_to_fiscal_position(product_values, fiscal_position)
        product_values = self._adapt_product_values_to_uom(product_values, product_uom)
        product_values = self._adapt_product_values_to_document_tax_mode(product_values, document_tax_mode)
        product_values = self._adapt_product_values_to_currency(product_values, currency, document_date)

        return product_values['price_unit']

    def _get_tax_included_unit_price_from_price(
        self, product_price_unit, product_taxes,
        fiscal_position=None,
        product_taxes_after_fp=None,
        document_tax_mode=None,
    ):
        if not product_taxes:
            return product_price_unit

        if product_taxes_after_fp is None:
            if not fiscal_position:
                return product_price_unit

            product_taxes_after_fp = fiscal_position.map_tax(product_taxes)

        return product_taxes._adapt_price_unit_to_another_taxes(
            price_unit=product_price_unit,
            product=self,
            original_taxes=product_taxes,
            new_taxes=product_taxes_after_fp,
            document_tax_mode=document_tax_mode,
        )

    @api.depends('lst_price', 'product_tmpl_id', 'taxes_id')
    @api.depends_context('company')
    def _compute_tax_string(self):
        for record in self:
            record.tax_string = record.product_tmpl_id._construct_tax_string(record.lst_price)

    # -------------------------------------------------------------------------
    # EDI
    # -------------------------------------------------------------------------

    def _import_retrieve_product_from_barcode(self, product_values):
        barcode = product_values.get('barcode')
        if barcode:
            return {'criteria': [{'domain': [('barcode', '=', barcode)]}]}

    def _import_retrieve_product_from_default_code(self, product_values):
        default_code = product_values.get('default_code')
        if default_code:
            return {'criteria': [{'domain': [('default_code', '=', default_code)]}]}

    def _import_retrieve_product_from_name(self, product_values):

        name = product_values.get('name')
        if not name:
            return

        def find_product_by_name_similarity(values):
            """ Returns the first product whose name similarity ratio with the provided name is at least 90%. """

            # Get similarity threshold from system parameter, fallback to 0.9 if missing, invalid, or out of range (0, 1].
            try:
                similarity_threshold = self.env['ir.config_parameter'].sudo().get_float('account.product_name_similarity_threshold', 0.9)
                if similarity_threshold <= 0.0 or similarity_threshold > 1.0:
                    similarity_threshold = 0.9
            except ValueError:
                similarity_threshold = 0.9

            all_product_ids = self.search(
                Domain.AND([
                    [('name', 'ilike', name)],
                    values['static_domain'],
                ]),
            ).ids
            lowered_name = name.lower()
            for products in split_every(PREFETCH_MAX, all_product_ids, self.browse):
                products.fetch(['product_tmpl_id'])
                templates = products.product_tmpl_id
                templates.fetch(['name'])
                for product in products:
                    if SequenceMatcher(None, lowered_name, product.name.lower()).ratio() >= similarity_threshold:
                        return product
                products.invalidate_recordset()
                templates.invalidate_recordset()
            return self.env['product.product']

        if name and '\n' in name:
            # cut Sales Description from the name
            name = name.split('\n')[0]
        if name:
            return {'criteria': [
                {'domain': [('name', '=', name)]},
                {'search_method': find_product_by_name_similarity, 'cache_key': str([('name', '=', name)])},
            ]}

    @api.model
    def _import_retrieve_product(self, search_plan, company, product_values_list):
        cache = {}

        static_domain = Domain.OR([
            [*self._check_company_domain(company), ('company_id', '!=', False)],
            [('company_id', '=', False)],
        ])
        for product_values in product_values_list:
            if product_values.get('product'):
                continue
            product = None
            for plan in search_plan:
                plan_values = plan(product_values)
                if not plan_values:
                    continue

                for criteria in plan_values['criteria']:
                    domain = criteria.get('domain')
                    search_method = criteria.get('search_method')
                    if domain:
                        domain = list(domain)
                        cache_key = str(domain)
                    else:
                        cache_key = criteria.get('cache_key')

                    cache_key = frozendict({
                        'cache_key': cache_key,
                        'intrastat_code': product_values.get('intrastat_code'),
                        'unspsc_code': product_values.get('unspsc_code'),
                        'l10n_ro_cpv_code': product_values.get('l10n_ro_cpv_code'),
                        'cg_item_classification_code': product_values.get('cg_item_classification_code'),
                    })

                    # Look at the cache if the value has already been tested with this key.
                    if cache_key in cache:
                        if product := cache[cache_key]:
                            product_values['product'] = product
                            break
                        else:
                            continue

                    orders = ['company_id', 'id DESC']
                    product_extra_domain = []
                    if (
                        (intrastat_code := product_values.get('intrastat_code'))
                        and 'intrastat_code_id' in self._fields
                        and (intrastat_code_record := self.env['account.intrastat.code'].search([('code', '=', intrastat_code)], limit=1))
                    ):
                        product_extra_domain.append(('intrastat_code_id', 'in', (intrastat_code_record.id, False)))
                        orders.insert(1, 'intrastat_code_id')
                    if (
                        (unspsc_code := product_values.get('unspsc_code'))
                        and 'unspsc_code_id' in self._fields
                        and (unspsc_code_record := self.env['product.unspsc.code'].search([('code', '=', unspsc_code)], limit=1))
                    ):
                        product_extra_domain.append(('unspsc_code_id', 'in', (unspsc_code_record.id, False)))
                        orders.insert(1, 'unspsc_code_id')
                    if (
                        (l10n_ro_cpv_code := product_values.get('l10n_ro_cpv_code'))
                        and 'cpv_code_id' in self._fields
                        and (cpv_code_record := self.env['l10n_ro.cpv.code'].search([('code', '=', l10n_ro_cpv_code)], limit=1))
                    ):
                        product_extra_domain.append(('cpv_code_id', 'in', (cpv_code_record.id, False)))
                        orders.insert(1, 'cpv_code_id')
                    if (
                        (cg_item_classification_code := product_values.get('cg_item_classification_code'))
                        and 'l10n_hr_kpd_category_id' in self._fields
                        and (cpv_code_record := self.env['l10n_hr.kpd.category'].search([('name', '=', cg_item_classification_code)], limit=1))
                    ):
                        product_extra_domain.append(('l10n_hr_kpd_category_id', 'in', (cpv_code_record.id, False)))
                        orders.insert(1, 'l10n_hr_kpd_category_id')

                    product_domain = Domain.AND([
                        static_domain,
                        product_extra_domain
                    ])

                    if domain:
                        full_domain = Domain.AND([product_domain, domain])
                        product = self.search(
                            full_domain,
                            order=', '.join(orders),
                            limit=1,
                        )
                    elif search_method:
                        product = search_method({
                            **criteria,
                            'static_domain': product_domain,
                        })

                    if product:
                        if cache_key:
                            cache[cache_key] = product
                        product_values['product'] = product
                        break

                if product:
                    break

    def _get_retrieval_product_search_plan(self):
        return [
            (5, self._import_retrieve_product_from_barcode),
            (10, self._import_retrieve_product_from_default_code),
            (15, self._import_retrieve_product_from_name),
        ]

    def _retrieve_product(self, company=None, extra_domain=None, **product_vals):
        '''Search all products and find one that matches one of the parameters.

        :param name:            The name of the product.
        :param default_code:    The default_code of the product.
        :param barcode:         The barcode of the product.
        :param company:         The company of the product.
        :param extra_domain:    Any extra domain to add to the search.
        :returns:               A product or an empty recordset if not found.
        '''
        self._import_retrieve_product(
            search_plan=[method[1] for method in sorted(self._get_retrieval_product_search_plan())],
            company=company or self.env.company,
            product_values_list=[product_vals],
        )
        return product_vals.get('product') or self.env['product.product']

    def _get_product_domain_search_order(self, **vals):
        """Gives the order of search for a product given the parameters.

        :param name:            The name of the product.
        :param default_code:    The default_code of the product.
        :param barcode:         The barcode of the product.
        :returns:               An ordered list of product domains and their associated priority.
        :rtype: list[tuple[int, Domain]]
        """
        sorted_domains = []
        if barcode := vals.get('barcode'):
            sorted_domains.append((5, Domain('barcode', '=', barcode)))
        if default_code := vals.get('default_code'):
            sorted_domains.append((10, Domain('default_code', '=', default_code)))
        if name := vals.get('name'):
            name = name.split('\n', 1)[0]  # Cut sales description from the name
            sorted_domains.append((15, Domain('name', '=ilike', name)))
        return sorted_domains

    def _get_price_diff_account(self):
        return self.product_tmpl_id._get_price_diff_account()
