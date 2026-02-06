from odoo.tests import tagged

from odoo.addons.pos_restaurant.tests.test_frontend import TestFrontend
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install', 'post_install_l10n')
class TestL10nBePosRestuarant(TestFrontend):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('be')
    def setUpClass(cls):
        super().setUpClass()

    def test_pos_receipt_label_on_receipt(self):
        ChartTemplate = self.env['account.chart.template'].with_company(self.env.company)
        tax_21 = ChartTemplate.ref('attn_VAT-OUT-21-L', raise_if_not_found=False)
        tax_12 = ChartTemplate.ref('attn_VAT-OUT-12-L', raise_if_not_found=False)
        tax_6 = ChartTemplate.ref('attn_VAT-OUT-06-L', raise_if_not_found=False)
        fp = False
        if tax_21 and tax_12 and tax_6:
            fp = self.env['account.fiscal.position'].create({
                'name': 'Take out',
            })
            self.env['account.fiscal.position.tax'].create({
                'tax_src_id': tax_21.id,
                'tax_dest_id': tax_6.id,
                'position_id': fp.id
            })
            self.env['account.fiscal.position.tax'].create({
                'tax_src_id': tax_12.id,
                'tax_dest_id': tax_6.id,
                'position_id': fp.id
            })

        self.preset_eat_in = self.env['pos.preset'].create({
            'name': 'Eat in',
        })
        self.preset_takeaway = self.env['pos.preset'].create({
            'name': 'Takeaway',
            'identification': 'name',
            'fiscal_position_id': fp.id if fp else False,
        })
        self.preset_delivery = self.env['pos.preset'].create({
            'name': 'Delivery',
            'identification': 'address',
        })
        self.main_pos_config.write({
            'use_presets': True,
            'default_preset_id': self.preset_eat_in.id,
            'available_preset_ids': [(6, 0, [
                self.preset_takeaway.id,
                self.preset_eat_in.id,
                self.preset_delivery.id,
            ])],
        })
        self.start_pos_tour('test_pos_receipt_label_on_receipt')
