import logging
from uuid import uuid4

from random import randint
from datetime import date, datetime, timedelta
from odoo import fields, tools
from odoo.fields import Command
from odoo.tests import Form
from odoo.tools import DEFAULT_SERVER_DATE_FORMAT
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


_logger = logging.getLogger(__name__)


def archive_products(env):
    # Archive all existing product to avoid noise during the tours
    all_pos_product = env['product.template'].search([('available_in_pos', '=', True)])
    all_pos_product._write({'active': False})


class CommonPosTest(AccountTestInvoicingCommon):
    """ Common values and helpers for every Point of Sale test.

    Set up the records that are shared by the test cases here, and implement
    the special scenarios by inheriting this class.
    """
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        archive_products(cls.env)

        cls.env.user.group_ids |= cls.env.ref('point_of_sale.group_pos_manager')
        cls.env.ref('base.EUR').active = True
        cls.env.ref('base.USD').active = True

        # Set basic defaults
        cls.account_tax_return_journal = cls.company_data['default_tax_return_journal']
        cls.sales_account = cls.company_data['default_account_revenue']
        cls.invoice_journal = cls.sale_journal = cls.company_data['default_journal_sale']
        cls.bank_journal = cls.company_data['default_journal_bank']
        cls.cash_journal = cls.company_data['default_journal_cash']
        cls.receivable_account = cls.company_data['default_account_receivable']
        cls.tax_received_account = cls.company_data['default_account_tax_sale']
        cls.company.account_default_pos_receivable_account_id = cls.env['account.account'].create({
            'code': 'X1012.POS',
            'name': 'Debtors - (POS)',
            'account_type': 'asset_receivable',
        })
        cls.pos_receivable_account = cls.company.account_default_pos_receivable_account_id
        cls.pos_receivable_cash = cls.copy_account(cls.company.account_default_pos_receivable_account_id, {'name': 'POS Receivable Cash'})
        cls.pos_receivable_bank = cls.copy_account(cls.company.account_default_pos_receivable_account_id, {'name': 'POS Receivable Bank'})
        cls.outstanding_bank = cls.copy_account(cls.inbound_payment_method_line.payment_account_id, {'name': 'Outstanding Bank'})
        cls.c1_receivable = cls.copy_account(cls.receivable_account, {'name': 'Customer 1 Receivable'})
        cls.other_receivable_account = cls.env['account.account'].create({
            'name': 'Other Receivable',
            'code': 'RCV00',
            'account_type': 'asset_receivable',
            'internal_group': 'asset',
        })

        # company_currency can be different from `base.USD` depending on the localization installed
        cls.company_currency = cls.company.currency_id
        # other_currency is a currency different from the company_currency
        # sometimes company_currency is different from USD, so handle appropriately.
        cls.other_currency = cls.setup_other_currency("EUR", rounding=0.001)

        cls.currency_pricelist = cls.env['product.pricelist'].create({
            'name': 'Public Pricelist',
            'currency_id': cls.company_currency.id,
        })
        # Set Point of Sale configurations
        # basic_config
        #   - derived from 'point_of_sale.pos_config_main' with added journal_id and credit payment method.
        # other_currency_config
        #   - pos.config set to have currency different from company currency.
        cls.pos_config = cls._create_basic_config()
        cls.pos_config_foreign = cls._create_other_currency_config()

        # Set product categories
        # categ_basic
        #   - just the plain 'product.product_category_services'
        # categ_anglo
        #   - product category with fifo and real_time valuations
        #   - used for checking anglo saxon accounting behavior
        cls.categ_basic = cls.env.ref('product.product_category_services')

        # other basics
        cls.sale_account = cls.company.income_account_id
        cls.other_sale_account = cls.env['account.account'].search([
            ('company_ids', '=', cls.company.id),
            ('account_type', '=', 'income'),
            ('id', '!=', cls.sale_account.id)
        ], limit=1)

        # Set customers
        cls.customer = cls.env['res.partner'].create({'name': 'Customer 1', 'property_account_receivable_id': cls.c1_receivable.id})
        cls.other_customer = cls.env['res.partner'].create({'name': 'Other Customer', 'property_account_receivable_id': cls.other_receivable_account.id})

        # Set taxes
        # cls.taxes => dict
        #   keys: 'tax7', 'tax10'(price_include=True), 'tax_group_7_10'
        cls.taxes = cls._create_taxes()

        # Records shared with the tests that used to rely on TestPoSCommon.
        cls.create_res_partners()
        cls.create_account_cash_rounding()
        cls.create_pos_categories()
        cls.create_account_taxes()
        cls.create_product_templates()
        cls.pos_config.write({'payment_method_ids': [(4, cls.pay_later_pm.id)]})
        cls._setup_legacy_aliases()
        cls._setup_frontend_fixtures()

    #####################
    ## private methods ##
    #####################

    @classmethod
    def _get_main_company(cls):
        return cls.company_data['company']

    @classmethod
    def _setup_frontend_fixtures(cls):
        """ Products, pricelists, attributes and partners the tours rely on.

        Built on the base class so that a python test and a tour test see the
        same records under the same names.
        """

        env = cls.env
        journal_obj = env['account.journal']
        main_company = cls._get_main_company()

        # The POS receivable account is already set up on the base class.
        cls.account_receivable = cls.pos_receivable_account
        env['ir.default'].set('res.partner', 'property_account_receivable_id', cls.account_receivable.id, company_id=main_company.id)
        # Pricelists are set below, do not take demo data into account
        env['res.partner'].sudo().invalidate_model(['property_product_pricelist', 'specific_property_product_pricelist'])
        # remove the all specific values for all companies only for test
        env.cr.execute('UPDATE res_partner SET specific_property_product_pricelist = NULL')

        # Create user.
        cls.pos_user = cls.env['res.users'].create({
            'name': 'A simple PoS man!',
            'login': 'pos_user',
            'password': 'pos_user',
            'group_ids': [
                (4, cls.env.ref('base.group_user').id),
                (4, cls.env.ref('point_of_sale.group_pos_user').id),
                (4, cls.env.ref('base.group_partner_manager').id),
            ],
            'tz': 'America/New_York',
        })
        cls.pos_admin = cls.env['res.users'].create({
            'name': 'A powerful PoS man!',
            'login': 'pos_admin',
            'password': 'pos_admin',
            'group_ids': [
                (4, cls.env.ref('point_of_sale.group_pos_manager').id),
            ],
            'tz': 'America/New_York',
        })

        cls.pos_user.partner_id.email = 'pos_user@test.com'
        cls.pos_admin.partner_id.email = 'pos_admin@test.com'

        # `bank_journal` / `bank_payment_method` and the shop itself come from
        # the base class; the tours configure that one config further below.
        cls.main_pos_config = cls.pos_config

        env['res.partner'].create({
            'name': 'Acme Corporation',
        })

        if 'enforce_cities' in cls.env['res.country']._fields:
            cls.env.company.country_id.enforce_cities = False

        cls.pos_desk_misc_test = env['pos.category'].create({
            'name': 'Misc test',
        })
        cls.pos_cat_chair_test = env['pos.category'].create({
            'name': 'Chair test',
        })
        cls.pos_cat_desk_test = env['pos.category'].create({
            'name': 'Desk test',
        })

        # test an extra price on an attribute
        cls.whiteboard_pen = env['product.template'].create({
            'name': 'Whiteboard Pen',
            'available_in_pos': True,
            'list_price': 1.20,
            'taxes_id': False,
            'weight': 0.01,
            'pos_categ_ids': [(4, cls.pos_desk_misc_test.id)],
        })
        cls.wall_shelf = env['product.template'].create({
            'name': 'Wall Shelf Unit',
            'available_in_pos': True,
            'list_price': 1.98,
            'taxes_id': False,
            'barcode': '2100005000000',
        })
        cls.small_shelf = env['product.template'].create({
            'name': 'Small Shelf',
            'available_in_pos': True,
            'list_price': 2.83,
            'taxes_id': False,
        })
        cls.magnetic_board = env['product.template'].create({
            'name': 'Magnetic Board',
            'available_in_pos': True,
            'list_price': 1.98,
            'taxes_id': False,
            'barcode': '2305000000004',
        })
        cls.monitor_stand = env['product.template'].create({
            'name': 'Monitor Stand',
            'available_in_pos': True,
            'list_price': 3.19,
            'taxes_id': False,
            'barcode': '0123456789',  # No pattern in barcode nomenclature
        })
        cls.desk_pad = env['product.template'].create({
            'name': 'Desk Pad',
            'available_in_pos': True,
            'list_price': 1.98,
            'taxes_id': False,
            'pos_categ_ids': [(4, cls.pos_cat_desk_test.id)],
        })
        cls.letter_tray = env['product.template'].create({
            'name': 'Letter Tray',
            'available_in_pos': True,
            'list_price': 4.80,
            'taxes_id': False,
            'categ_id': env.ref('product.product_category_services').id,
            'pos_categ_ids': [(4, cls.pos_cat_chair_test.id)],
        })
        cls.desk_organizer = env['product.template'].create({
            'name': 'Desk Organizer',
            'available_in_pos': True,
            'list_price': 5.10,
            'taxes_id': False,
            'barcode': '2300002000007',
        })
        cls.configurable_chair = env['product.template'].create({
            'name': 'Configurable Chair',
            'available_in_pos': True,
            'list_price': 10,
            'taxes_id': False,
        })
        cls.vanela_gathiya = env['product.template'].create({
            'name': 'Vanela Gathiya',
            'available_in_pos': True,
            'list_price': 10,
            'taxes_id': False,
            'to_weight': True,
        })

        attribute = env['product.attribute'].create({
            'name': 'add 2',
        })
        attribute_value = env['product.attribute.value'].create({
            'name': 'add 2',
            'attribute_id': attribute.id,
        })
        line = env['product.template.attribute.line'].create({
            'product_tmpl_id': cls.whiteboard_pen.id,
            'attribute_id': attribute.id,
            'value_ids': [(6, 0, attribute_value.ids)]
        })
        line.product_template_value_ids[0].price_extra = 2

        cls.chair_color_attribute = env['product.attribute'].create({
            'name': 'Color',
            'display_type': 'color',
            'create_variant': 'no_variant',
        })
        cls.chair_color_red = env['product.attribute.value'].create({
            'name': 'Red',
            'attribute_id': cls.chair_color_attribute.id,
            'html_color': '#ff0000',
        })
        chair_color_blue = env['product.attribute.value'].create({
            'name': 'Blue',
            'attribute_id': cls.chair_color_attribute.id,
            'html_color': '#0000ff',
        })
        chair_color_line = env['product.template.attribute.line'].create({
            'product_tmpl_id': cls.configurable_chair.id,
            'attribute_id': cls.chair_color_attribute.id,
            'value_ids': [(6, 0, [cls.chair_color_red.id, chair_color_blue.id])]
        })
        chair_color_line.product_template_value_ids[0].price_extra = 1

        chair_legs_attribute = env['product.attribute'].create({
            'name': 'Chair Legs',
            'display_type': 'select',
            'create_variant': 'no_variant',
        })
        chair_legs_metal = env['product.attribute.value'].create({
            'name': 'Metal',
            'attribute_id': chair_legs_attribute.id,
        })
        chair_legs_wood = env['product.attribute.value'].create({
            'name': 'Wood',
            'attribute_id': chair_legs_attribute.id,
        })
        env['product.template.attribute.line'].create({
            'product_tmpl_id': cls.configurable_chair.id,
            'attribute_id': chair_legs_attribute.id,
            'value_ids': [(6, 0, [chair_legs_metal.id, chair_legs_wood.id])]
        })

        cls.chair_fabrics_attribute = env['product.attribute'].create({
            'name': 'Fabrics',
            'display_type': 'radio',
            'create_variant': 'no_variant',
        })
        chair_fabrics_leather = env['product.attribute.value'].create({
            'name': 'Leather',
            'attribute_id': cls.chair_fabrics_attribute.id,
        })
        cls.chair_fabrics_wool = env['product.attribute.value'].create({
            'name': 'wool',
            'attribute_id': cls.chair_fabrics_attribute.id,
        })
        cls.chair_fabrics_other = env['product.attribute.value'].create({
            'name': 'Other',
            'attribute_id': cls.chair_fabrics_attribute.id,
            'is_custom': True,
        })
        env['product.template.attribute.line'].create({
            'product_tmpl_id': cls.configurable_chair.id,
            'attribute_id': cls.chair_fabrics_attribute.id,
            'value_ids': [(6, 0, [chair_fabrics_leather.id, cls.chair_fabrics_wool.id, cls.chair_fabrics_other.id])]
        })
        chair_color_line.product_template_value_ids[1].is_custom = True

        cls.chair_addons_attribute = env['product.attribute'].create({
            'name': 'Add-ons',
            'display_type': 'multi',
            'create_variant': 'no_variant',
        })
        cls.chair_addon_cushion = env['product.attribute.value'].create({
            'name': 'Cushion',
            'attribute_id': cls.chair_addons_attribute.id,
        })
        cls.chair_addon_cupholder = env['product.attribute.value'].create({
            'name': 'Cup Holder',
            'attribute_id': cls.chair_addons_attribute.id,
        })
        cls.chair_addon_headrest = env['product.attribute.value'].create({
            'name': 'Headrest',
            'attribute_id': cls.chair_addons_attribute.id,
        })
        env['product.template.attribute.line'].create({
            'product_tmpl_id': cls.configurable_chair.id,
            'attribute_id': cls.chair_addons_attribute.id,
            'value_ids': [(6, 0, [cls.chair_addon_cushion.id, cls.chair_addon_cupholder.id, cls.chair_addon_headrest.id])]
        })

        fixed_pricelist = env['product.pricelist'].create({
            'name': 'Fixed',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
                'applied_on': '0_product_variant',
                'product_id': cls.wall_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 13.95,  # test for issues like in 7f260ab517ebde634fc274e928eb062463f0d88f
                'applied_on': '0_product_variant',
                'product_id': cls.small_shelf.product_variant_id.id,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Percentage',
            'item_ids': [(0, 0, {
                'compute_price': 'percentage',
                'percent_price': 100,
                'applied_on': '0_product_variant',
                'product_id': cls.wall_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'percentage',
                'percent_price': 99,
                'applied_on': '0_product_variant',
                'product_id': cls.small_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'percentage',
                'percent_price': 0,
                'applied_on': '0_product_variant',
                'product_id': cls.magnetic_board.product_variant_id.id,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Formula',
            'item_ids': [(0, 0, {
                'compute_price': 'formula',
                'price_discount': 6,
                'price_surcharge': 5,
                'applied_on': '0_product_variant',
                'product_id': cls.wall_shelf.product_variant_id.id,
            }), (0, 0, {
                # .99 prices
                'compute_price': 'formula',
                'price_surcharge': -0.01,
                'price_round': 1,
                'applied_on': '0_product_variant',
                'product_id': cls.small_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'formula',
                'price_min_margin': 10,
                'price_max_margin': 100,
                'applied_on': '0_product_variant',
                'product_id': cls.magnetic_board.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'formula',
                'price_surcharge': 10,
                'price_max_margin': 5,
                'applied_on': '0_product_variant',
                'product_id': cls.monitor_stand.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'formula',
                'price_discount': -100,
                'price_min_margin': 5,
                'price_max_margin': 20,
                'applied_on': '0_product_variant',
                'product_id': cls.desk_pad.product_variant_id.id,
            })],
        })

        env['product.pricelist'].create({
            'name': 'min_quantity ordering',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'applied_on': '0_product_variant',
                'min_quantity': 2,
                'product_id': cls.wall_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
                'applied_on': '0_product_variant',
                'min_quantity': 1,
                'product_id': cls.wall_shelf.product_variant_id.id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'applied_on': '0_product_variant',
                'min_quantity': 5,
                'product_id': cls.monitor_stand.product_variant_id.id,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Product template',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'applied_on': '1_product',
                'product_tmpl_id': cls.wall_shelf.id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
            })],
        })

        product_category_3 = env['product.category'].create({
            'name': 'Services',
            'parent_id': env.ref('product.product_category_services').id,
        })

        env['product.pricelist'].create({
            # no category has precedence over category
            'name': 'Category vs no category',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'applied_on': '2_product_category',
                'categ_id': product_category_3.id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Category',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
                'applied_on': '2_product_category',
                'categ_id': env.ref('product.product_category_services').id,
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'applied_on': '2_product_category',
                'categ_id': product_category_3.id,
            })],
        })

        today = date.today()
        one_week_ago = today - timedelta(weeks=1)
        two_weeks_ago = today - timedelta(weeks=2)
        one_week_from_now = today + timedelta(weeks=1)
        two_weeks_from_now = today + timedelta(weeks=2)

        public_pricelist = env['product.pricelist'].create({
            'name': 'Public Pricelist',
        })

        env['product.pricelist'].create({
            'name': 'Dates',
            'item_ids': [(0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 1,
                'date_start': two_weeks_ago.strftime(DEFAULT_SERVER_DATE_FORMAT),
                'date_end': one_week_ago.strftime(DEFAULT_SERVER_DATE_FORMAT),
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 2,
                'date_start': today.strftime(DEFAULT_SERVER_DATE_FORMAT),
                'date_end': one_week_from_now.strftime(DEFAULT_SERVER_DATE_FORMAT),
            }), (0, 0, {
                'compute_price': 'fixed',
                'fixed_price': 3,
                'date_start': one_week_from_now.strftime(DEFAULT_SERVER_DATE_FORMAT),
                'date_end': two_weeks_from_now.strftime(DEFAULT_SERVER_DATE_FORMAT),
            })],
        })

        cost_base_pricelist = env['product.pricelist'].create({
            'name': 'Cost base',
            'item_ids': [(0, 0, {
                'base': 'standard_price',
                'compute_price': 'percentage',
                'percent_price': 55,
            })],
        })

        pricelist_base_pricelist = env['product.pricelist'].create({
            'name': 'Pricelist base',
            'item_ids': [(0, 0, {
                'base': 'pricelist',
                'base_pricelist_id': cost_base_pricelist.id,
                'compute_price': 'percentage',
                'percent_price': 15,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Pricelist base 2',
            'item_ids': [(0, 0, {
                'base': 'pricelist',
                'base_pricelist_id': pricelist_base_pricelist.id,
                'compute_price': 'percentage',
                'percent_price': 3,
            })],
        })

        env['product.pricelist'].create({
            'name': 'Pricelist base rounding',
            'item_ids': [(0, 0, {
                'base': 'pricelist',
                'base_pricelist_id': fixed_pricelist.id,
                'compute_price': 'percentage',
                'percent_price': 0.01,
            })],
        })

        excluded_pricelist = env['product.pricelist'].create({
            'name': 'Not loaded'
        })
        res_partner_18 = env['res.partner'].create({
            'name': 'Lumber Inc',
        })
        res_partner_18.property_product_pricelist = excluded_pricelist

        test_sale_journal = journal_obj.create({'name': 'Sales Journal - Test',
                                                'code': 'TSJ',
                                                'type': 'sale',
                                                'company_id': main_company.id})

        all_pricelists = env['product.pricelist'].search([
            ('id', '!=', excluded_pricelist.id),
            '|', ('company_id', '=', main_company.id), ('company_id', '=', False)
        ])
        all_pricelists.write(dict(currency_id=main_company.currency_id.id))

        FP_POS_2M = env['account.fiscal.position'].create({
            'name': "FP-POS-2M",
        })

        src_tax = env['account.tax'].create({
            'name': "SRC",
            'amount': 10,
            'fiscal_position_ids': main_company.domestic_fiscal_position_id,
        })
        env['account.tax'].create({'name': "DST", 'amount': 5, 'fiscal_position_ids': [Command.link(FP_POS_2M.id)], 'original_tax_ids': [Command.link(src_tax.id)]})
        env['account.tax'].create({'name': "DST2", 'amount': 10, 'fiscal_position_ids': [Command.link(FP_POS_2M.id)], 'original_tax_ids': [Command.link(src_tax.id)]})

        cls.letter_tray.taxes_id = [(6, 0, [src_tax.id])]

        cash_pm = cls.cash_pm
        cls.main_pos_config.write({
            'tax_regime_selection': True,
            'fiscal_position_ids': FP_POS_2M,
            'journal_id': test_sale_journal.id,
            'payment_method_ids': [(4, cash_pm.id)],
            'use_pricelist': True,
            'pricelist_id': public_pricelist.id,
            'available_pricelist_ids': [(4, pricelist.id) for pricelist in all_pricelists],
        })

        cls.printer = cls.env['pos.printer'].create({
            'name': 'Printer',
            'printer_type': 'epson_epos',
            'printer_ip': '0.0.0.0',
            'use_type': 'receipt',
        })

        # Set customers
        # Unlink some data partners that makes the test crash
        for xmlid in [
            "l10n_us_hr_payroll.res_partner_taxation_va",
            "l10n_us_hr_payroll.res_partner_revenue_dc",
            "l10n_us_hr_payroll.res_partner_pfl_dc",
            "l10n_us_hr_payroll.res_partner_revenue_or",
            "l10n_us_hr_payroll.res_partner_dcbs_or",
            "l10n_us_hr_payroll.res_partner_employment_or",
            "l10n_us_hr_payroll.res_partner_revenue_nc",
            "l10n_us_hr_payroll.res_partner_state_tax_commission_id",
            "l10n_us_hr_payroll.res_partner_department_taxes_vt",
            "l10n_us_hr_payroll.res_partner_department_revenue_il",
            "l10n_us_hr_payroll.res_partner_department_revenue_az",
        ]:
            partner = cls.env.ref(xmlid, raise_if_not_found=False)
            if partner:
                partner.unlink()

        partners = cls.env['res.partner'].create([
            {'name': 'Partner Test 1'},
            {'name': 'Partner Test 2'},
            {'name': 'Partner Test 3'},
            {
                'name': 'APartner Full',
                'email': 'partner.full@example.com',
                'street': '77 Santa Barbara Rd',
                'city': 'Pleasant Hill',
                'state_id': cls.env.ref('base.state_us_5').id,
                'zip': '94523',
                'country_id': cls.env.ref('base.us').id,
            }
        ])
        cls.partner_test_1 = partners[0]
        cls.partner_test_2 = partners[1]
        cls.partner_test_3 = partners[2]
        cls.partner_full = partners[3]

        # Change the default sale pricelist of customers,
        # so the js tests can expect deterministically this pricelist when selecting a customer.
        # bad hack only for test
        env['ir.default'].set("res.partner", "specific_property_product_pricelist", public_pricelist.id, company_id=main_company.id)

    @classmethod
    def _create_basic_config(cls):
        config = cls.env['pos.config'].create({
            'name': 'Shop',
            'journal_id': cls.invoice_journal.id,
            'available_pricelist_ids': cls.currency_pricelist.ids,
            'pricelist_id': cls.currency_pricelist.id,
        })
        cls.company_data['default_journal_cash'].pos_payment_method_ids.unlink()
        cls.cash_pm = config.payment_method_ids.filtered(lambda c: c.journal_id.type == 'cash')
        if cls.cash_pm:
            cls.cash_pm.write({'receivable_account_id': cls.pos_receivable_cash.id})
        else:
            cls.cash_pm = cls.env['pos.payment.method'].create({
                'name': 'Cash',
                'type': 'cash',
                'journal_id': cls.company_data['default_journal_cash'].id,
                'receivable_account_id': cls.pos_receivable_cash.id,
                'company_id': cls.env.company.id,
            })
        cls.bank_pm = cls.env['pos.payment.method'].create({
            'name': 'Bank',
            'type': 'bank',
            'journal_id': cls.company_data['default_journal_bank'].id,
            'receivable_account_id': cls.pos_receivable_bank.id,
            'outstanding_account_id': cls.outstanding_bank.id,
            'company_id': cls.env.company.id,
        })
        cls.bank_split_pm = cls.bank_pm.copy(default={
            'name': 'Split (Bank) PM',
        })
        cls.pay_later_pm = cls.env['pos.payment.method'].create({'name': 'Pay Later', 'type': 'pay_later'})
        config.write({'payment_method_ids': [(4, cls.bank_split_pm.id), (4, cls.cash_pm.id), (4, cls.bank_pm.id), (4, cls.pay_later_pm.id)]})
        return config

    @classmethod
    def _create_other_currency_config(cls):
        (cls.other_currency.rate_ids | cls.company_currency.rate_ids).unlink()
        cls.env['res.currency.rate'].create({
            'rate': 0.5,
            'currency_id': cls.other_currency.id,
            'name': fields.Date.subtract(datetime.today().date(), days=1),
        })
        other_cash_journal = cls.env['account.journal'].create({
            'name': 'Cash Other',
            'type': 'cash',
            'company_id': cls.company.id,
            'code': 'CSHO',
            'sequence': 10,
            'currency_id': cls.other_currency.id
        })
        other_sales_journal = cls.env['account.journal'].create({
            'name':'PoS Sale Other',
            'type': 'sale',
            'code': 'POSO',
            'company_id': cls.company.id,
            'sequence': 12,
            'currency_id': cls.other_currency.id
        })
        other_bank_journal = cls.env['account.journal'].create({
            'name': 'Bank Other',
            'type': 'bank',
            'company_id': cls.company.id,
            'code': 'BNKO',
            'sequence': 13,
            'currency_id': cls.other_currency.id
        })
        other_pricelist = cls.env['product.pricelist'].create({
            'name': 'Public Pricelist Other',
            'currency_id': cls.other_currency.id,
        })
        cls.cash_pm_foreign = cls.env['pos.payment.method'].create({
            'name': 'Cash Other',
            'type': 'cash',
            'journal_id': other_cash_journal.id,
            'receivable_account_id': cls.pos_receivable_cash.id,
        })
        cls.bank_pm_foreign = cls.env['pos.payment.method'].create({
            'name': 'Bank Other',
            'type': 'bank',
            'journal_id': other_bank_journal.id,
            'receivable_account_id': cls.pos_receivable_bank.id,
            'outstanding_account_id': cls.outstanding_bank.id,
        })

        config = cls.env['pos.config'].create({
            'name': 'Shop Other',
            'journal_id': other_sales_journal.id,
            'use_pricelist': True,
            'available_pricelist_ids': other_pricelist.ids,
            'pricelist_id': other_pricelist.id,
            'payment_method_ids': [cls.cash_pm_foreign.id, cls.bank_pm_foreign.id],
        })
        return config

    @classmethod
    def _create_taxes(cls):
        """ Create taxes

        tax7: 7%, excluded in product price
        tax10: 10%, included in product price
        tax21: 21%, included in product price
        """
        def create_tag(name):
            return cls.env['account.account.tag'].create({
                'name': name,
                'applicability': 'taxes',
                'country_id': cls.env.company.account_fiscal_country_id.id
            })

        cls.tax_tag_invoice_base = create_tag('Invoice Base tag')
        cls.tax_tag_invoice_tax = create_tag('Invoice Tax tag')
        cls.tax_tag_refund_base = create_tag('Refund Base tag')
        cls.tax_tag_refund_tax = create_tag('Refund Tax tag')

        def create_tax(percentage, price_include_override='tax_excluded', include_base_amount=False):
            return cls.env['account.tax'].create({
                'name': f'Tax {percentage}%',
                'amount': percentage,
                'price_include_override': price_include_override,
                'amount_type': 'percent',
                'include_base_amount': include_base_amount,
                'invoice_repartition_line_ids': [
                    (0, 0, {
                        'repartition_type': 'base',
                        'tag_ids': [(6, 0, cls.tax_tag_invoice_base.ids)],
                    }),
                    (0, 0, {
                        'repartition_type': 'tax',
                        'account_id': cls.tax_received_account.id,
                        'tag_ids': [(6, 0, cls.tax_tag_invoice_tax.ids)],
                    }),
                ],
                'refund_repartition_line_ids': [
                    (0, 0, {
                        'repartition_type': 'base',
                        'tag_ids': [(6, 0, cls.tax_tag_refund_base.ids)],
                    }),
                    (0, 0, {
                        'repartition_type': 'tax',
                        'account_id': cls.tax_received_account.id,
                        'tag_ids': [(6, 0, cls.tax_tag_refund_tax.ids)],
                    }),
                ],
            })

        def create_tax_fixed(amount, price_include_override='tax_excluded', include_base_amount=False):
            return cls.env['account.tax'].create({
                'name': f'Tax fixed amount {amount}',
                'amount': amount,
                'price_include_override': price_include_override,
                'include_base_amount': include_base_amount,
                'amount_type': 'fixed',
                'invoice_repartition_line_ids': [
                    (0, 0, {
                        'repartition_type': 'base',
                        'tag_ids': [(6, 0, cls.tax_tag_invoice_base.ids)],
                    }),
                    (0, 0, {
                        'repartition_type': 'tax',
                        'account_id': cls.tax_received_account.id,
                        'tag_ids': [(6, 0, cls.tax_tag_invoice_tax.ids)],
                    }),
                ],
                'refund_repartition_line_ids': [
                    (0, 0, {
                        'repartition_type': 'base',
                        'tag_ids': [(6, 0, cls.tax_tag_refund_base.ids)],
                    }),
                    (0, 0, {
                        'repartition_type': 'tax',
                        'account_id': cls.tax_received_account.id,
                        'tag_ids': [(6, 0, cls.tax_tag_refund_tax.ids)],
                    }),
                ],
            })

        tax_fixed006 = create_tax_fixed(0.06, price_include_override='tax_included', include_base_amount=True)
        tax_fixed012 = create_tax_fixed(0.12, price_include_override='tax_included', include_base_amount=True)
        tax7 = create_tax(7, price_include_override='tax_excluded')
        tax8 = create_tax(8, include_base_amount=True)
        tax9 = create_tax(9)
        tax10 = create_tax(10, price_include_override='tax_included')
        tax21 = create_tax(21, price_include_override='tax_included')


        tax_group_7_10 = tax7.copy()
        with Form(tax_group_7_10) as tax:
            tax.name = 'Tax 7+10%'
            tax.amount_type = 'group'
            tax.children_tax_ids.add(tax7)
            tax.children_tax_ids.add(tax10)

        return {
            'tax7': tax7,
            'tax8': tax8,
            'tax9': tax9,
            'tax10': tax10,
            'tax21': tax21,
            'tax_fixed006': tax_fixed006,
            'tax_fixed012': tax_fixed012,
            'tax_group_7_10': tax_group_7_10
        }

    ####################
    ## public methods ##
    ####################

    # TODO-PARP: this always used with sync_from_ui.
    # Maybe we can create 2 methods for order creation:
    #   - create_order : for one order
    #   - create_orders : for multiple order creation
    def create_ui_order_data(self, pos_order_lines_ui_args, pos_order_ui_args={}, customer=False, is_invoiced=False, payments=None, uuid=None):
        """ Mocks the order_data generated by the pos ui.

        This is useful in making orders in an open pos session without making tours.
        Its functionality is tested in test_pos_create_ui_order_data.py.

        Before use, make sure that self is set with:
            1. pricelist -> the pricelist of the current session
            2. currency -> currency of the current session
            3. pos_session -> the current session, equivalent to config.current_session_id
            4. cash_pm -> first cash payment method in the current session
            5. config -> the active pos.config

        The above values should be set when `self.open_new_session` is called.

        :param list(tuple) pos_order_lines_ui_args: pairs of `ordered product` and `quantity`
        or triplet of `ordered product`, `quantity` and discount
        :param list(tuple) payments: pair of `payment_method` and `amount`
        """
        default_fiscal_position = self.config.default_fiscal_position_id
        fiscal_position = customer.property_account_position_id if customer else default_fiscal_position

        def normalize_order_line_param(param):
            if isinstance(param, dict):
                return param

            assert len(param) >= 2
            return {
                'product': param[0],
                'quantity': param[1],
                'discount': 0.0 if len(param) == 2 else param[2],
            }

        def create_order_line(product, quantity, **kwargs):
            price_unit = self.pricelist._get_product_price(product, quantity)
            tax_ids = fiscal_position.map_tax(product.taxes_id.filtered_domain(self.env['account.tax']._check_company_domain(self.env.company)))
            discount = kwargs.get('discount', 0.0)
            price_unit_after_discount = price_unit * (1 - discount / 100.0)
            tax_values = (
                tax_ids.compute_all(price_unit_after_discount, self.currency, quantity)
                if tax_ids
                else {
                    'total_excluded': price_unit_after_discount * quantity,
                    'total_included': price_unit_after_discount * quantity,
                }
            )
            return (0, 0, {
                'id': randint(1, 1000000),
                'price_unit': price_unit,
                'product_id': product.id,
                'price_subtotal': abs(tax_values['total_excluded']),  # Must never be negative, qty is used to determine the sign of the amounts
                'price_subtotal_incl': abs(tax_values['total_included']),  # Must never be negative, qty is used to determine the sign of the amounts
                'qty': quantity,
                'tax_ids': [(6, 0, tax_ids.ids)],
                **kwargs,
            })

        def create_payment(payment_method, amount):
            return (0, 0, {
                'amount': amount,
                'name': fields.Datetime.now(),
                'payment_method_id': payment_method.id,
            })

        uuid = uuid or uuid4()

        # 1. generate the order lines
        order_lines = [
            create_order_line(**normalize_order_line_param(param))
            for param in pos_order_lines_ui_args
        ]

        # 2. generate the payments
        total_amount_incl = 0
        total_amount_base = 0
        for line in order_lines:
            line_sign = 1 if line[2]['qty'] >= 0 else -1
            line_price = line[2]['price_subtotal_incl'] * line_sign
            base_price = line[2]['price_subtotal'] * line_sign

            total_amount_incl += line_price
            total_amount_base += base_price
        if payments is None:
            default_cash_pm = self.config.payment_method_ids.filtered(lambda pm: pm.type == 'cash')[:1]
            if not default_cash_pm:
                raise Exception('There should be a cash payment method set in the pos.config.')
            payments = [create_payment(default_cash_pm, total_amount_incl)]
        else:
            payments = [
                create_payment(pm, amount)
                for pm, amount in payments
            ]

        # 3. complete the fields of the order_data
        return {
            'amount_paid': sum(payment[2]['amount'] for payment in payments),
            'amount_return': 0,
            'amount_tax': total_amount_incl - total_amount_base,
            'amount_total': total_amount_incl,
            'date_order': fields.Datetime.to_string(fields.Datetime.now()),
            'fiscal_position_id': fiscal_position.id,
            'pricelist_id': self.config.pricelist_id.id,
            'name': 'Order %s' % uuid,
            'lines': order_lines,
            'partner_id': customer and customer.id,
            'session_id': self.pos_session.id,
            'payment_ids': payments,
            'uuid': uuid,
            'user_id': self.env.uid,
            'to_invoice': is_invoiced,
            **pos_order_ui_args,
        }

    @classmethod
    def create_product(cls, name, category, lst_price, standard_price=None, tax_ids=None, sale_account=None):
        product = cls.env['product.product'].create({
            'is_storable': True,
            'available_in_pos': True,
            'taxes_id': [(5, 0, 0)] if not tax_ids else [(6, 0, tax_ids)],
            'name': name,
            'categ_id': category.id,
            'lst_price': lst_price,
            'standard_price': standard_price if standard_price else 0.0,
            'company_id': cls.env.company.id,
        })
        if sale_account:
            product.property_account_income_id = sale_account
        return product

    def open_new_session(self, opening_cash=0):
        """ Used to open new pos session in each configuration.

        - The idea is to properly set values that are constant
          and commonly used in an open pos session.
        - Calling this method is also a prerequisite for using
          `self.create_ui_order_data` function.

        Fields:
            * config : the pos.config currently being used.
                Its value is set at `self.setUp` of the inheriting
                test class.
            * pos_session : the current_session_id of config
            * currency : currency of the current pos.session
            * pricelist : the default pricelist of the session
        """
        self.config.open_ui()
        self.pos_session = self.config.current_session_id
        self.currency = self.pos_session.currency_id
        self.pricelist = self.pos_session.config_id.pricelist_id
        self.pos_session.set_opening_control(opening_cash, None)
        return self.pos_session

    # TODO-PARP: used only 3 times and only in pos_stock,
    # This depends on following methods which ony used here, hense limited used
    #   - _check_invoice_journal_entries
    #   - _check_session_journal_entries
    #       - _find_then_assert_values
    #           - _assert_account_move
    #   - _start_pos_session
    #
    # Can make generlised methods to asserts the entries if required rather than this whole stressed structure
    def _run_test(self, args):
        pos_session = self._start_pos_session(args['payment_methods'], args.get('opening_cash', 0))
        _logger.info('DONE: Start session.')
        orders_map = self._create_orders(args['orders'])
        _logger.info('DONE: Orders created.')
        before_closing_cb = args.get('before_closing_cb')
        if before_closing_cb:
            before_closing_cb()
            _logger.info('DONE: Call of before_closing_cb.')
        self._check_invoice_journal_entries(pos_session, orders_map, expected_values=args['journal_entries_before_closing'])
        _logger.info('DONE: Checks for journal entries before closing the session.')
        cash_payment_method = pos_session.payment_method_ids.filtered(lambda pm: pm.type == 'cash')[:1]
        total_cash_payment = sum(pos_session.mapped('order_ids.payment_ids').filtered(lambda payment: payment.payment_method_id.id == cash_payment_method.id).mapped('amount'))
        pos_session.close_session_from_ui({cash_payment_method.id: total_cash_payment})
        after_closing_cb = args.get('after_closing_cb')
        if after_closing_cb:
            after_closing_cb()
            _logger.info('DONE: Call of after_closing_cb.')
        self._check_session_journal_entries(pos_session, expected_values=args['journal_entries_after_closing'])
        _logger.info('DONE: Checks for journal entries after closing the session.')

    # TODO-PARP: replace it with open_new_session
    def _start_pos_session(self, payment_methods, opening_cash):
        self.config.write({'payment_method_ids': [(6, 0, payment_methods.ids)]})
        pos_session = self.open_new_session(opening_cash)
        self.assertEqual(self.config.payment_method_ids.ids, pos_session.payment_method_ids.ids, msg='Payment methods in the config should be the same as the session.')
        return pos_session

    def _create_orders(self, order_data_params):
        '''Returns a dict mapping uuid to its created pos.order record.'''
        result = {}
        order_data = [self.create_ui_order_data(**params) for params in order_data_params]
        order_ids = [order['id'] for order in self.env['pos.order'].sync_from_ui(order_data)['pos.order']]
        for order_id in self.env["pos.order"].browse(order_ids):
            result[order_id.uuid] = order_id
        return result

    def _check_invoice_journal_entries(self, pos_session, orders_map, expected_values):
        '''Checks the invoice, together with the payments, from each invoiced order.'''
        currency_rounding = pos_session.currency_id.rounding

        for uid in orders_map:
            order = orders_map[uid]
            if not order.is_singly_invoiced:
                continue
            invoice = order.account_move
            # allow not checking the invoice since pos is not creating the invoices
            if expected_values[uid].get('invoice'):
                self._assert_account_move(invoice, expected_values[uid]['invoice'])
                _logger.info('DONE: Check of invoice for order %s.', uid)

            for pos_payment in order.payment_ids:
                if pos_payment.payment_method_id == self.pay_later_pm:
                    # Skip the pay later payments since there are no journal entries
                    # for them when invoicing.
                    continue

                # This predicate is used to match the pos_payment's journal entry to the
                # list of payments specified in the 'payments' field of the `_run_test`
                # args.
                def predicate(args):
                    payment_method, amount = args
                    first = payment_method == pos_payment.payment_method_id
                    second = tools.float_is_zero(pos_payment.amount - amount, precision_rounding=currency_rounding)
                    return first and second

                self._find_then_assert_values(pos_payment.account_move_id, expected_values[uid]['payments'], predicate)
                _logger.info('DONE: Check of invoice payment (%s, %s) for order %s.', pos_payment.payment_method_id.name, pos_payment.amount, uid)

    def _check_session_journal_entries(self, pos_session, expected_values):
        '''Checks the journal entries after closing the session excluding entries checked in `_check_invoice_journal_entries`.'''
        currency_rounding = pos_session.currency_id.rounding

        # check expected session journal entry
        self._assert_account_move(pos_session.sale_move_ids, expected_values['session_journal_entry'])
        _logger.info("DONE: Check of the session's account move.")

        # check expected cash journal entries
        for statement_line in pos_session.bank_statement_line_ids:
            def statement_line_predicate(args):
                return tools.float_is_zero(statement_line.amount - args[0], precision_rounding=currency_rounding)
            self._find_then_assert_values(statement_line.move_id, expected_values['cash_statement'], statement_line_predicate)
        _logger.info("DONE: Check of cash statement lines.")

    def _find_then_assert_values(self, account_move, source_of_expected_vals, predicate):
        expected_move_vals = next(move_vals for args, move_vals in source_of_expected_vals if predicate(args))
        self._assert_account_move(account_move, expected_move_vals)

    def _assert_account_move(self, account_move, expected_account_move_vals):
        if expected_account_move_vals:
            # We allow partial checks of the lines of the account move if `line_ids_predicate` is specified.
            # This means that only those that satisfy the predicate are compared to the expected account move line_ids.
            line_ids_predicate = expected_account_move_vals.pop('line_ids_predicate', lambda _: True)
            line_ids = expected_account_move_vals.pop('line_ids')
            reconciliation_statuses = []
            for line in line_ids:
                partially_reconciled = line.pop('partially_reconciled', False)
                if partially_reconciled is True:
                    reconciliation_statuses.append('partially_reconciled')
                else:
                    reconciliation_statuses.append('fully_reconciled' if line.get('reconciled') else 'not_reconciled')
            account_move_line_ids = account_move.line_ids.filtered(line_ids_predicate)
            self.assertRecordValues(account_move_line_ids, line_ids)
            self.assertRecordValues(account_move, [expected_account_move_vals])

            # Check reconciliation status
            for line, reconciliation_status in zip(account_move_line_ids, reconciliation_statuses):
                # See 'account_move_line._compute_amount_residual'  for more explanation
                if reconciliation_status == 'fully_reconciled':
                    if line.matching_number:
                        self.assertTrue(line.full_reconcile_id)
                    self.assertAlmostEqual(line.amount_residual, 0)
                elif reconciliation_status == 'partially_reconciled':
                    self.assertFalse(line.full_reconcile_id)
                    if line.reconciled:
                        self.assertAlmostEqual(line.amount_residual, 0)
                    else:
                        self.assertGreater(abs(line.amount_residual), 0)
                elif reconciliation_status == 'not_reconciled':
                    self.assertFalse(line.full_reconcile_id)
                    self.assertFalse(line.reconciled)
        else:
            # if the expected_account_move_vals is falsy, the account_move should be falsy.
            self.assertFalse(account_move)

    def make_payment(self, order, payment_method, amount):
        """ Make payment for the order using the given payment method.
        """
        payment_context = {"active_id": order.id, "active_ids": order.ids}
        return self.env['pos.make.payment'].with_context(**payment_context).create({
            'amount': amount,
            'payment_method_id': payment_method.id,
        }).check()

    #####################
    ## record builders ##
    #####################

    @classmethod
    def _setup_legacy_aliases(cls):
        """ Old attribute names, kept so the other modules keep importing.

        `CommonPosTest`, `TestPoSCommon` and `TestPointOfSaleHttpCommon` each
        built their own POS config, cash/bank/pay-later payment method and
        receivable account. There is now a single record for each of those --
        a cash payment method cannot even be shared between two configs, see
        `pos.payment.method._check_cash_method_single_shop` -- and the names
        below all point at it. Drop this method once the other modules use the
        canonical names.
        """
        # POS configs
        cls.basic_config = cls.pos_config_usd = cls.main_pos_config = cls.pos_config
        cls.other_currency_config = cls.pos_config_eur = cls.pos_config_foreign
        cls.pricelist_eur = cls.pos_config_foreign.pricelist_id

        # Payment methods
        cls.cash_pm1 = cls.cash_payment_method = cls.cash_pm
        cls.bank_pm1 = cls.bank_payment_method = cls.bank_pm
        cls.bank_split_pm1 = cls.bank_split_pm
        cls.credit_payment_method = cls.pay_later_pm
        cls.cash_pm2 = cls.cash_pm_foreign
        cls.bank_pm2 = cls.bank_pm_foreign

        # Accounts
        cls.account_receivable = cls.pos_receivable_account

    @classmethod
    def create_res_partners(cls):
        cls.partner_mobt = cls.env['res.partner'].create({
            'name': 'MOBT',
        })
        cls.partner_adgu = cls.env['res.partner'].create({
            'name': 'ADGU',
        })
        cls.partner_lowe = cls.env['res.partner'].create({
            'name': 'LOWE',
        })
        cls.partner_jcb = cls.env['res.partner'].create({
            'name': 'JCB',
        })
        cls.partner_moda = cls.env['res.partner'].create({
            'name': 'MODA',
        })
        cls.partner_stva = cls.env['res.partner'].create({
            'name': 'STVA',
        })
        cls.partner_manv = cls.env['res.partner'].create({
            'name': 'MANV',
        })
        cls.partner_vlst = cls.env['res.partner'].create({
            'name': 'VLST',
        })

    @classmethod
    def create_account_cash_rounding(cls):
        cls.account_cash_rounding_down = cls.env['account.cash.rounding'].create({
            'name': 'Rounding down',
            'rounding': 0.05,
            'rounding_method': 'DOWN',
            'profit_account_id': cls.company_data['default_account_revenue'].id,
            'loss_account_id': cls.company_data['default_account_expense'].id,
        })
        cls.account_cash_rounding_up = cls.env['account.cash.rounding'].create({
            'name': 'Rounding up',
            'rounding': 0.05,
            'rounding_method': 'UP',
            'profit_account_id': cls.company_data['default_account_revenue'].id,
            'loss_account_id': cls.company_data['default_account_expense'].id,
        })
        cls.account_cash_rounding_half = cls.env['account.cash.rounding'].create({
            'name': 'Rounding half',
            'rounding': 0.05,
            'profit_account_id': cls.company_data['default_account_revenue'].id,
            'loss_account_id': cls.company_data['default_account_expense'].id,
        })

    @classmethod
    def create_pos_categories(cls):
        cls.cat_no_tax = cls.env['pos.category'].create({
            'name': 'No tax',
            'sequence': 0,
        })
        cls.cat_tax_five_incl = cls.env['pos.category'].create({
            'name': 'Tax five incl',
            'sequence': 1,
        })
        cls.cat_tax_ten_incl = cls.env['pos.category'].create({
            'name': 'Tax ten incl',
            'sequence': 2,
        })
        cls.cat_tax_fiften_incl = cls.env['pos.category'].create({
            'name': 'Tax fifteen incl',
            'sequence': 3,
        })
        cls.cat_tax_five_excl = cls.env['pos.category'].create({
            'name': 'Tax five excl',
            'sequence': 4,
        })
        cls.cat_tax_ten_excl = cls.env['pos.category'].create({
            'name': 'Tax ten excl',
            'sequence': 5,
        })
        cls.cat_tax_fiften_excl = cls.env['pos.category'].create({
            'name': 'Tax fifteen excl',
            'sequence': 6,
        })

    @classmethod
    def create_account_taxes(cls):
        cls.tax_five_incl = cls.env['account.tax'].create({
            'name': 'Tax five incl',
            'amount': 5,
            'price_include_override': 'tax_included',
        })
        cls.tax_ten_incl = cls.env['account.tax'].create({
            'name': 'Tax ten incl',
            'amount': 10,
            'price_include_override': 'tax_included',
        })
        cls.tax_fiften_incl = cls.env['account.tax'].create({
            'name': 'Tax fifteen incl',
            'amount': 15,
            'price_include_override': 'tax_included',
        })
        cls.tax_five_excl = cls.env['account.tax'].create({
            'name': 'Tax five excl',
            'amount': 5,
        })
        cls.tax_ten_excl = cls.env['account.tax'].create({
            'name': 'Tax ten excl',
            'amount': 10,
        })
        cls.tax_fiften_excl = cls.env['account.tax'].create({
            'name': 'Tax fifteen excl',
            'amount': 15,
        })

    @classmethod
    def create_product_templates(cls):
        cls.ten_dollars_no_tax = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars no tax',
            'list_price': 10.0,
            'pos_categ_ids': [(6, 0, [cls.cat_no_tax.id])],
            'taxes_id': [(5, 0)],
        })
        cls.twenty_dollars_no_tax = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars no tax',
            'list_price': 20.0,
            'pos_categ_ids': [(6, 0, [cls.cat_no_tax.id])],
            'taxes_id': [(5, 0)],
        })
        cls.ten_dollars_with_5_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 5 included',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_five_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_five_incl.id])],
        })
        cls.twenty_dollars_with_5_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 5 included',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_five_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_five_incl.id])],
        })
        cls.ten_dollars_with_10_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 10 included',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_ten_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_ten_incl.id])],
        })
        cls.twenty_dollars_with_10_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 10 included',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_ten_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_ten_incl.id])],
        })
        cls.ten_dollars_with_15_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 15 included',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_fiften_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_fiften_incl.id])],
        })
        cls.twenty_dollars_with_15_incl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 15 included',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_fiften_incl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_fiften_incl.id])],
        })
        cls.ten_dollars_with_5_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 5 excluded',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_five_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_five_excl.id])],
        })
        cls.twenty_dollars_with_5_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 5 excluded',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_five_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_five_excl.id])],
        })
        cls.ten_dollars_with_10_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 10 excluded',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_ten_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_ten_excl.id])],
        })
        cls.twenty_dollars_with_10_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 10 excluded',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_ten_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_ten_excl.id])],
        })
        cls.ten_dollars_with_15_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Ten dollars with 15 excluded',
            'list_price': 10.0,
            'taxes_id': [(6, 0, [cls.tax_fiften_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_fiften_excl.id])],
        })
        cls.twenty_dollars_with_15_excl = cls.env['product.template'].create({
            'available_in_pos': True,
            'name': 'Twenty dollars with 15 excluded',
            'list_price': 20.0,
            'taxes_id': [(6, 0, [cls.tax_fiften_excl.id])],
            'pos_categ_ids': [(6, 0, [cls.cat_tax_fiften_excl.id])],
        })

    def create_backend_pos_order(self, data):
        pos_config = data.get('pos_config', self.pos_config_usd)
        order_data = data.get('order_data', {})
        line_product_ids = [line_data['product_id'] for line_data in data.get('line_data', [])]
        product_by_id = {p.id: p for p in self.env['product.product'].browse(line_product_ids)}
        refund = False

        if not pos_config.current_session_id:
            pos_config.open_ui()

        order = self.env['pos.order'].create({
            'amount_total': 0,
            'amount_paid': 0,
            'amount_tax': 0,
            'amount_return': 0,
            'date_order': fields.Datetime.to_string(fields.Datetime.now()),
            'company_id': pos_config.company_id.id,
            'session_id': pos_config.current_session_id.id,
            'lines': [
                Command.create({
                    'price_unit': product_by_id[line_data['product_id']].lst_price,
                    'price_subtotal': product_by_id[line_data['product_id']].lst_price,
                    'tax_ids': [(6, 0, product_by_id[line_data['product_id']].taxes_id.ids)],
                    'price_subtotal_incl': 0,
                    **line_data,
                }) for line_data in data.get('line_data', [])
            ],
            **order_data,
        })

        # Re-trigger prices computation
        order.lines._onchange_amount_line_all()
        order._compute_prices()

        if data.get('payment_data'):
            payment_context = {"active_ids": order.ids, "active_id": order.id}
            for payment in data['payment_data']:
                make_payment = {'payment_method_id': payment['payment_method_id']}
                if payment.get('amount'):
                    make_payment['amount'] = payment['amount']
                order_payment = self.env['pos.make.payment'].with_context(**payment_context).create(make_payment)
                order_payment.with_context(**payment_context).check()

        if data.get('refund_data'):
            refund_action = order.refund()
            refund = self.env['pos.order'].browse(refund_action['res_id'])
            payment_context = {"active_ids": refund.ids, "active_id": refund.id}

            if data.get('order_data') and data['order_data'].get('to_invoice', False):
                refund.to_invoice = True

            for refund_data in data['refund_data']:
                make_refund = {'payment_method_id': refund_data['payment_method_id']}
                if refund_data.get('amount'):
                    make_refund['amount'] = refund_data['amount']
                refund_payment = self.env['pos.make.payment'].with_context(**payment_context).create(make_refund)
                refund_payment.with_context(**payment_context).check()

        return order, refund

    def compute_tax(self, product, price, qty=1, taxes=None, pos_config=None):
        config = pos_config or self.pos_config_usd
        if not taxes:
            taxes = product.taxes_id.filtered(lambda t: t.company_id.id == self.env.company.id)
        currency = config.currency_id
        res = taxes.compute_all(price, currency, qty, product=product)
        untax = res['total_excluded']
        return untax, sum(tax.get('amount', 0.0) for tax in res['taxes'])


# `CommonPosTest` and `TestPoSCommon` were two separate bases building the same
# kind of records under different names. They are now a single class; this alias
# keeps the old name working for the other modules and is removed once they are
# adapted.
TestPoSCommon = CommonPosTest
