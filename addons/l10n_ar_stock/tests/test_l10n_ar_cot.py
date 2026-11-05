from unittest.mock import patch

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests import freeze_time, tagged

from odoo.addons.l10n_ar.tests.common import TestArCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
@freeze_time('2026-11-05 12:00:00')
class TestArCot(TestArCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.ref('uom.product_uom_unit').l10n_ar_arba_unit_code = '3'
        cls.product = cls.env['product.product'].create({
            'name': 'Test Product',
            'default_code': 'PROD-1',
            'l10n_ar_arba_code': '847150',
        })
        cls.carrier = cls.env['res.partner'].create({
            'name': 'Carrier',
            'vat': '20222222223',
            'l10n_ar_afip_responsibility_type_id': cls.env.ref('l10n_ar.res_RM').id,
        })
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.company_ri.id)], limit=1)
        cls.picking_type = cls.env['stock.picking.type'].create({
            'name': 'Remito Outgoing',
            'code': 'outgoing',
            'company_id': cls.company_ri.id,
            'sequence_code': 'OUT',
            'warehouse_id': cls.warehouse.id,
            'l10n_ar_document_type_id': cls.env.ref('l10n_ar.dc_r_r').id,
        })

    def _create_picking(self, **cot_vals):
        picking = self.env['stock.picking'].create({
            'location_id': self.warehouse.lot_stock_id.id,
            'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            'picking_type_id': self.picking_type.id,
            'partner_id': self.res_partner_adhoc.id,
            'move_ids': [Command.create({
                'product_id': self.product.id,
                'product_uom_qty': 5.0,
                'location_id': self.warehouse.lot_stock_id.id,
                'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            })],
        })
        picking.action_confirm()
        picking.button_validate()
        picking.l10n_ar_action_create_delivery_guide()
        picking.write({
            'l10n_ar_cot_departure_date': '2026-11-06 10:00:00',
            'l10n_ar_cot_license_plate': 'AB123CD',
            'l10n_ar_cot_carrier_id': self.carrier.id,
            'l10n_ar_cot_amount': 1234.5,
            **cot_vals,
        })
        return picking

    def test_cot_generation_demo(self):
        picking = self._create_picking()
        picking.l10n_ar_action_generate_cot()

        self.assertEqual(picking.l10n_ar_cot_number, f'{picking.id:014d}')
        self.assertFalse(picking.l10n_ar_cot_error)
        txt = self.env['ir.attachment'].search([
            ('res_model', '=', 'stock.picking'),
            ('res_id', '=', picking.id),
            ('name', '=', 'TB_30111111118_000000_20261105_120000.txt'),
        ])
        self.assertEqual(txt.raw.decode('ISO-8859-1').splitlines(keepends=True), [
            '01|30111111118\n',
            (
                '02|20261105|0910000100000001|20261106||E|0|||30714295698|ADHOC SA|0'
                '|Ovidio Lagos 41 bis||S/N||||2000|Rosario|S||SI|30111111118|(AR) Responsable Inscripto (Unit Tests)|1'
                '|Calle Falsa 123||S/N||||2000|Rosario|S|20222222223|||||AB123CD||0|123450\n'
            ),
            '03|847150|3|500|PROD-1|Test Product|Units|500\n',
            '04|1\n',
        ])

    def test_cot_missing_configuration(self):
        self.product.l10n_ar_arba_code = False
        picking = self._create_picking(l10n_ar_cot_license_plate=False, l10n_ar_cot_departure_date='2026-12-25 10:00:00')

        with self.assertRaisesRegex(UserError, 'Vehicle License Plate is missing') as error:
            picking.l10n_ar_action_generate_cot()
        self.assertIn("between today and 30 days", str(error.exception))
        self.assertIn("Products without ARBA Code: [PROD-1] Test Product", str(error.exception))

    def test_cot_error_response(self):
        self.company_ri.write({
            'l10n_ar_arba_cit': 'Password123',
            'l10n_ar_arba_cot_environment': 'testing',
        })
        picking = self._create_picking()
        response_content = """<?xml version="1.0" encoding="ISO-8859-1" ?>
            <TBCOMPROBANTE>
                <cuitEmpresa>30111111118</cuitEmpresa>
                <validacionesRemitos class="list">
                    <remito>
                        <numeroUnico>0910000100000001</numeroUnico>
                        <procesado>NO</procesado>
                        <errores class="list">
                            <error>
                                <codigo>21</codigo>
                                <descripcion>El campo CODIGO_UNICO es inválido o inexistente.</descripcion>
                            </error>
                        </errores>
                    </remito>
                </validacionesRemitos>
            </TBCOMPROBANTE>""".encode('ISO-8859-1')

        with patch('odoo.addons.l10n_ar_stock.models.stock_picking.requests.post') as mock_post:
            mock_post.return_value.content = response_content
            picking.l10n_ar_action_generate_cot()

        self.assertEqual(mock_post.call_args.kwargs['data'], {'user': '30111111118', 'password': 'Password123'})
        self.assertFalse(picking.l10n_ar_cot_number)
        self.assertEqual(picking.l10n_ar_cot_error, '[21] El campo CODIGO_UNICO es inválido o inexistente.')
