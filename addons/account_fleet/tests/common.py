from odoo.addons.account.tests.common import AccountTestInvoicingCommon


class TestAccountFleetCommon(AccountTestInvoicingCommon):
    user_groups=[
        'base.group_partner_manager',
        'account.group_account_manager',
        'analytic.group_analytic_accounting',
        'fleet.fleet_group_manager',
    ]
