from difflib import SequenceMatcher

from odoo import api, fields, models
from odoo.fields import Domain
from odoo.tools import frozendict
from odoo.tools.constants import IN_MAX
from odoo.tools.misc import split_every


class ProductProduct(models.Model):
    _inherit = "product.product"

    catalog_is_in_selected_section = fields.Boolean(
        search="_search_is_in_selected_catalog_section", store=False
    )
    tax_string = fields.Char(compute='_compute_tax_string')

    def _search_is_in_selected_catalog_section(self, operator, value):
        if operator != 'in':
            return NotImplemented

        ctx = self.env.context
        order_id = ctx.get('order_id')
        order_model = ctx.get('product_catalog_order_model')
        line_field = ctx.get('child_field')
        if not (order_id and order_model and line_field):
            return []

        order_lines = self.env[order_model].browse(order_id)[line_field]
        product_ids = order_lines.filtered(lambda line: line._is_in_section()).product_id.ids

        return [('id', 'in', product_ids)]

    def _get_product_accounts(self):
        return self.product_tmpl_id._get_product_accounts()

    def _get_tax_included_unit_price(self, company, currency, document_date, document_type,
        is_refund_document=False, product_uom=None, product_currency=None,
        product_price_unit=None, product_taxes=None, fiscal_position=None,
        document_tax_mode=None, partner=None, qty=None,
    ):
        """ Helper to get the price unit from different models.
            This is needed to compute the same unit price in different models (sale order, account move, etc.) with same parameters.
        """
        self.ensure_one()
        company.ensure_one()

        product = self

        assert document_type

        if product_uom is None:
            product_uom = product.uom_id
        if not product_currency:
            if document_type == 'sale':
                product_currency = product.currency_id
            elif document_type == 'purchase':
                product_currency = company.currency_id
        if product_price_unit is None:
            if document_type == 'sale':
                product_price_unit = product.with_company(company).lst_price
            elif document_type == 'purchase':
                supplier_info = product.with_company(company)._get_filtered_sellers(
                    partner_id=partner,
                    quantity=qty,
                    date=document_date,
                    uom_id=product_uom,
                )[:1] if partner else False
                if supplier_info:
                    product_price_unit = supplier_info.currency_id._convert(supplier_info.price_discounted, product_currency, company, document_date, round=False)
                else:
                    product_price_unit = product.with_company(company).standard_price
            else:
                return 0.0
        if product_taxes is None:
            if document_type == 'sale':
                product_taxes = product.taxes_id
            elif document_type == 'purchase':
                product_taxes = product.supplier_taxes_id
        if product_taxes:
            product_taxes = product_taxes._filter_taxes_by_company(company)
        # Apply unit of measure.
        if product_uom and product.uom_id != product_uom:
            product_price_unit = product.uom_id._compute_price(product_price_unit, product_uom)

        # Apply document tax mode.
        if document_tax_mode:
            product_price_unit = self._adapt_price_unit_to_document_tax_mode(
                product_price_unit,
                product_taxes,
                product_uom,
                document_tax_mode,
            )

        # Apply fiscal position.
        if product_taxes and fiscal_position:
            product_price_unit = self._get_tax_included_unit_price_from_price(
                product_price_unit,
                product_taxes,
                fiscal_position=fiscal_position,
                document_tax_mode=document_tax_mode,
            )

        # Apply currency rate.
        if currency != product_currency:
            product_price_unit = product_currency._convert(product_price_unit, currency, company, document_date, round=False)

        return product_price_unit

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

    @api.model
    def _adapt_price_unit_to_document_tax_mode(
        self,
        product_price_unit,
        product_taxes,
        product_uom,
        document_tax_mode,
    ):
        if document_tax_mode == self.company_id.account_price_include:
            return product_price_unit
        results = product_taxes._get_tax_details(
            price_unit=product_price_unit,
            quantity=1.0,
            rounding_method='round_globally',
            product=self,
            product_uom=product_uom,
            document_tax_mode=self.company_id.account_price_include,
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

        return price_unit

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

    def _import_retrieve_product_from_supplierinfo(self, product_values):
        vendor_partner_id = product_values.get('vendor_partner_id')
        if not vendor_partner_id:
            return {}
        product_codes = [
            code for code in [
                product_values.get('sellers_item_id'),
                product_values.get('standard_item_id'),
                product_values.get('buyers_item_id'),
            ]
            if code
        ]
        if not product_codes:
            return {}

        return {
            'criteria': [{
                'domain': [(
                    'product_tmpl_id.seller_ids', 'any', [
                        ('partner_id', '=', vendor_partner_id),
                        ('product_code', 'in', product_codes),
                    ],
                )]
            }]
        }

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
            for products in split_every(IN_MAX, all_product_ids, self.browse):
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
            (5, self._import_retrieve_product_from_supplierinfo),
            (10, self._import_retrieve_product_from_barcode),
            (15, self._import_retrieve_product_from_default_code),
            (20, self._import_retrieve_product_from_name),
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
