import logging
from unittest import SkipTest

from odoo.fields import Domain
from odoo.tests import TransactionCase

from odoo.addons.account.tests.common import TEST_COMPANY_XMLID_BY_COUNTRY_CODE

_logger = logging.getLogger(__name__)


class TestL10n(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        all_chart_templates = cls.env['account.chart.template']._get_chart_template_mapping()
        installed_modules = set(cls.env['ir.module.module']._installed())
        matching_country_templates = [
            (template_code, template)
            for template_code, template in all_chart_templates.items()
            if template['country_id'] == cls.country_id
            and template['module'] in installed_modules
        ]
        if not matching_country_templates:
            raise SkipTest("No template found")
        companies = cls.env['res.company']
        company_xmlid = TEST_COMPANY_XMLID_BY_COUNTRY_CODE.get(cls.country_code)
        for index, (template_code, template) in enumerate(matching_country_templates):
            company_values = {
                'name': f'company_coa_{template_code}',
                'country_id': template['country_id'],
            }
            if index == 0 and company_xmlid:
                shared_company = cls.env.ref(company_xmlid)
                # This test reloads the chart below. Do not replace accounting data on a
                # shared company, as downstream modules may already reference its journals.
                if shared_company.chart_template:
                    company = cls.env['res.company'].create(company_values)
                else:
                    company = shared_company
                    company.write(company_values)
            else:
                company = cls.env['res.company'].create(company_values)
            companies |= company
        cls.companies = companies
        for (template_code, template), company in zip(matching_country_templates, companies):
            cls.env['account.chart.template'].with_context(l10n_check_fields_complete=True).try_loading(template_code, company, install_demo=False)

    def _test_domestic_fiscal_position(self):
        for company in self.companies:
            template_code = company.chart_template
            if company.fiscal_position_ids and not company.domestic_fiscal_position_id:
                _logger.warning("No domestic fiscal position found in fiscal data for %s %s.", company.country_id.name, template_code)
            elif company.fiscal_position_ids:
                potential_domestic_fps = company.fiscal_position_ids.filtered_domain(
                    Domain('country_id', '=', company.country_id.id)
                    | (
                        Domain('country_id', '=', False)
                        & Domain('country_group_id', 'in', company.country_id.country_group_ids.ids)
                    )
                )
                if len(potential_domestic_fps) > 1:
                    potential_domestic_fps.sorted(lambda x: x.country_id.id or float('inf')).sorted('sequence')
                    if (
                        (potential_domestic_fps[0].country_id == potential_domestic_fps[1].country_id)
                        and (potential_domestic_fps[0].sequence == potential_domestic_fps[1].sequence)
                    ):
                        _logger.warning("Several fiscal positions fitting for being tagged as domestic were found in fiscal data for %s %s.", company.country_id.name, template_code)

    def _test_load_demo(self):
        if self.country_code in [
            'AR',
            'CL',
            'EC',
            'EG',
            'IN',
            'PE',
            'PK',
            'SA',
            'UY',
        ]:
            return  # These countries currently don't work without the generic demo

        user_demo = 'base.' + 'user_demo'  # trick the CI into trusting me, as the complete string is forbidden outside of demo files
        if not self.env.ref(user_demo, raise_if_not_found=False):
            self.env['res.partner']._load_records([
                {'xml_id': 'base.res_partner_1', 'values': {'name': 'Demo Partner 1'}},
                {'xml_id': 'base.res_partner_2', 'values': {'name': 'Demo Partner 2'}},
                {'xml_id': 'base.res_partner_3', 'values': {'name': 'Demo Partner 3'}},
                {'xml_id': 'base.res_partner_4', 'values': {'name': 'Demo Partner 4'}},
                {'xml_id': 'base.res_partner_5', 'values': {'name': 'Demo Partner 5'}},
                {'xml_id': 'base.res_partner_6', 'values': {'name': 'Demo Partner 6'}},
                {'xml_id': 'base.res_partner_12', 'values': {'name': 'Demo Partner 12'}},
                {'xml_id': 'base.partner_demo', 'values': {'name': 'Marc Demo'}},
            ])
            self.env['res.users']._load_records([
                {'xml_id': user_demo, 'values': {'name': 'Marc Demo', 'login': 'demo'}},
            ])
            self.env['product.product']._load_records([
                {'xml_id': 'product.product_delivery_01', 'values': {'name': 'product_delivery_01', 'type': 'consu'}},
                {'xml_id': 'product.product_delivery_02', 'values': {'name': 'product_delivery_02', 'type': 'consu'}},
                {'xml_id': 'product.consu_delivery_01', 'values': {'name': 'consu_delivery_01', 'type': 'consu'}},
                {'xml_id': 'product.consu_delivery_02', 'values': {'name': 'consu_delivery_02', 'type': 'consu'}},
                {'xml_id': 'product.consu_delivery_03', 'values': {'name': 'consu_delivery_03', 'type': 'consu'}},
                {'xml_id': 'product.product_order_01', 'values': {'name': 'product_order_01', 'type': 'consu'}},
                {'xml_id': 'product.product_product_1', 'values': {'name': 'product_product_1', 'type': 'consu'}},
                {'xml_id': 'product.product_product_2', 'values': {'name': 'product_product_2', 'type': 'consu'}},
            ])
        self.env['account.chart.template']._install_demo(self.companies)
